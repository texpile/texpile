// turning edits to the open file into suggestions, and accepting or rejecting them
import { resolveEvent, type CommentEvent, type CommentThread, type SuggestionDecision } from '$lib/comments/log';
import {
	compareSuggestions,
	type EditMode,
	type PlacedSuggestion,
	type TypingSide,
	type WhitespaceChanges
} from '$lib/comments/suggestCompare';
import { isOpenSuggestion } from '$lib/comments/suggest';
import { carryGestures, carryGesturesThrough, type TextSpan } from '$lib/comments/editGestures';
import { commonEnds, dialectWhitespace } from '$lib/comments/suggestHunks';
import { activeSuggestions, takeEditedPlaces, takeTypedSides, type EditedPlaces } from '$lib/comments/activeSuggestions.svelte';
import type { CommentStore } from '$lib/comments/store.svelte';
import { changeEvents, movedAnchorEvents } from './suggestionEvents';
import { fitSuggestions, type Carried } from './suggestionFit';
import { placedAgain, placedBehind, rejectedAgain, renamedFile, restoredOver } from './suggestionStates';
import { sameFileState, sameMark, sameSuggestions, suggestionMarks, withoutRejected } from './suggestionStates';
import type { ExpectedReject, FileState, RemoteEdit } from './suggestionStates';

const SPACE_WAIT_MS = 1000;

export type SourceEdit = { from: number; to: number; insert: string };

type Deps = {
	store: CommentStore;
	activeFile: () => string | null;
	activeText: () => string;
	mode: () => EditMode;
	author: () => Promise<string>;
	commit: (...events: CommentEvent[]) => Promise<void>;
	applyEdit: (edit: SourceEdit) => Promise<boolean>;
	saveNow: () => void;
	compares: () => boolean;
	rewraps: () => boolean;
	onLost?: (file: string, lost: Set<string>) => void;
	/** puts the Accept numbered `seq` into the open editor's undo history; see comments/decisionHistory.ts */
	markDecision?: (seq: number) => void;
};

// as deep as the editors' own undo history
const REJECTS_KEPT = 100;

/** the file just before (`open`) and just after (`rejected`) a Reject, or a version from Local History that rejected several */
type UndoableReject = { file: string; threads: CommentThread[]; open: FileState; rejected: FileState };

/** an Accept the editors' undo can take back, and where the suggestion stood */
type UndoableAccept = { file: string; thread: CommentThread; at?: PlacedSuggestion };

/** an edit recorded for someone other than the reader: `gestures` is where it landed, `opened` the suggestions it made or revised */
type AgentEdit = { by: string; note: string; gestures: TextSpan[]; opened: string[] };

export class SuggestionsController {
	private states = new Map<string, FileState>();
	private placedFile: string | null = null;
	private seen: { path: string | null; file: string | null; text: string; rewraps: boolean } | null = null;
	private gestures: TextSpan[] = [];
	private sides: Record<string, TypingSide> = {};
	private chain: Promise<void> = Promise.resolve();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private me: string | null = null;
	// a reader who does not record just had an event from the recorder
	private caughtUp = false;
	// the suggestions such a reader drew from its own typing, which the recorder answers under its own ids
	private drawnHere = new Set<string>();
	private rejects: UndoableReject[] = [];
	private accepts = new Map<number, UndoableAccept>();
	private acceptSeq = 0;
	private expected: ExpectedReject[] = [];

	constructor(private readonly deps: Deps) {}

	place(file: string, text: string): Set<string> {
		const known = this.states.get(file);
		const reopened = !known || file !== this.placedFile;
		this.placedFile = file;
		const against = reopened ? text : known.text;
		const carried = new Map(reopened ? [] : known.placed.map((s, i) => [s.id, { ...s, i }]));
		const { kept, lost } = this.fit(file, against, carried);
		const same = !reopened && sameSuggestions(known.placed, kept);
		this.states.set(file, { text: against, placed: kept });
		if (!same && file === this.deps.activeFile()) this.show(against, kept);
		// warmed whether or not anything is placed yet: resolving it spawns git, and the first comparison
		// awaits it, so the words deleted while it runs are already gone from the file with nothing drawn
		// where they were
		if (this.me === null) void this.learnAuthor();
		return lost;
	}

	private fit(file: string, against: string, carried: Carried) {
		const reader = { compares: this.deps.compares(), caughtUp: this.caughtUp, drawnHere: this.drawnHere };
		const r = fitSuggestions(this.deps.store.forFile(file), against, carried, reader);
		this.caughtUp = false;
		this.drawnHere = r.drawnHere;
		return r;
	}

	/** a file or folder renamed in the tree; what is known of the files under it follows */
	moved(from: string, to: string): void {
		this.states = new Map([...this.states].map(([file, state]) => [renamedFile(file, from, to), state]));
		if (this.placedFile) this.placedFile = renamedFile(this.placedFile, from, to);
		if (this.seen?.file) this.seen = { ...this.seen, file: renamedFile(this.seen.file, from, to) };
		for (const decided of [...this.rejects, ...this.accepts.values(), ...this.expected]) decided.file = renamedFile(decided.file, from, to);
	}

	/** an event from the recorder arrived */
	answered(): void {
		if (!this.deps.compares()) this.caughtUp = true;
	}

	clear(): void {
		this.placedFile = null;
		if (activeSuggestions.current.length) activeSuggestions.current = [];
	}

	textChanged(path: string | null, text: string): void {
		const same = this.seen && this.seen.path === path;
		const suggesting = this.deps.mode() === 'suggesting';
		const places = takeEditedPlaces();
		this.gestures = !same || !suggesting ? [] : this.carried(places, this.seen!.text, text);
		this.sides = same ? { ...this.sides, ...takeTypedSides() } : takeTypedSides();
		this.seen = { path, file: this.deps.activeFile(), text, rewraps: this.deps.rewraps() };
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(
			() => {
				this.timer = null;
				void this.settle();
			},
			suggesting && this.onlySpaceSince(text) ? SPACE_WAIT_MS : 0
		);
	}

	private carried(places: EditedPlaces | null, before: string, after: string): TextSpan[] {
		if (places?.before === before && places.after === after) return carryGesturesThrough(this.gestures, places.changes);
		return carryGestures(this.gestures, before, after);
	}

	private onlySpaceSince(text: string): boolean {
		const state = this.states.get(this.deps.activeFile() ?? '');
		if (!state) return false;
		const { start, end } = commonEnds(state.text, text);
		return state.text.length - end === start && /^\s+$/.test(text.slice(start, text.length - end));
	}

	settle(mode: EditMode = this.deps.mode()): Promise<void> {
		const file = this.deps.activeFile();
		return file ? this.run(file, this.deps.activeText(), mode) : this.chain;
	}

	async beforeSave(file: string, content: string): Promise<void> {
		await this.run(file, content, this.deps.mode());
		await this.beforeWrite(file, content);
	}

	/** a collaborator's change, recorded under their name and mode; the reader's own typing up to
	 *  `before` is compared first, in the reader's mode, so it stays theirs */
	remoteEdit(file: string, before: string, after: string, edit: RemoteEdit): Promise<void> {
		if (!this.states.has(file)) this.states.set(file, { text: before, placed: this.fit(file, before, new Map()).kept });
		const active = file === this.deps.activeFile();
		void this.run(file, before, active ? this.deps.mode() : 'editing', active ? undefined : 'paragraphs');
		const agent: AgentEdit = { by: edit.by, note: '', gestures: edit.gestures, opened: [] };
		return this.run(file, after, edit.mode, edit.mode === 'suggesting' ? 'exact' : 'paragraphs', agent);
	}

	/** before `content` goes to disk: what was recorded on the way goes to the log first */
	async beforeWrite(file: string, content: string): Promise<void> {
		await this.chain;
		await this.recordAnchors(file, content);
		if (this.deps.store.hasStaged) await this.deps.store.append();
		this.deps.store.saved(file);
	}

	/** someone else rejected `id`; the words it puts back arrive as their edit, which is that Reject and not a new change */
	expectReject(id: string): void {
		for (const [file, state] of this.states) {
			const s = state.placed.find((x) => x.id === id);
			if (s) this.expected = [...this.expected.slice(1 - REJECTS_KEPT), { file, s, text: state.text, behind: placedBehind(state, s) }];
		}
	}

	private async recordAnchors(file: string, content: string): Promise<void> {
		const state = this.states.get(file);
		if (state?.text === content && state.placed.length) {
			const by = await this.deps.author();
			this.deps.store.stage(...movedAnchorEvents(content, state.placed, this.deps.store.forFile(file), by));
		}
	}

	async adoptDisk(file: string, text: string): Promise<void> {
		if (this.deps.store.hasStagedFor(file)) return this.discardUnsaved(file);
		await this.run(file, text, 'editing', 'paragraphs');
		if (this.deps.store.hasStaged) await this.deps.store.append();
		this.deps.store.saved(file);
	}

	/**
	 * Bringing back a version of `file` from Local History is an edit in Editing over the file as it is (`before`). The
	 * suggestions it removes are rejected rather than withdrawn, and kept as a Reject is, so the Undo on its notice,
	 * which writes `before` back, reopens the same threads, replies and all. In the log at once: the text is on disk
	 */
	async droppedBy(file: string, before: string, text: string): Promise<number> {
		await this.chain;
		return this.deps.compares() ? restoredOver(file, this.stateOn(file, before), text).dropped.size : 0;
	}

	async restoreVersion(file: string, before: string, text: string): Promise<void> {
		await this.chain;
		if (!this.deps.compares()) return;
		const open = this.stateOn(file, before);
		const r = restoredOver(file, open, text);
		const by = await this.deps.author();
		const threads = this.deps.store.threads.filter((t) => r.dropped.has(t.id));
		const rejected = await Promise.all(threads.map((t) => this.decision(t, 'rejected')));
		this.deps.store.stage(...changeEvents(file, text, r, by, '', this.deps.store.threads), ...rejected);
		const restored = { text, placed: r.placed };
		this.states.set(file, restored);
		if (threads.length) this.rejects = [...this.rejects.slice(1 - REJECTS_KEPT), { file, threads, open, rejected: restored }];
		if (file === this.deps.activeFile()) this.show(text, r.placed);
		if (this.deps.store.hasStaged) await this.deps.store.append();
		this.deps.store.saved(file);
	}

	/** what is known of `file` when its text is `before`; for a file not open, read from the log's anchors */
	private stateOn(file: string, before: string): FileState {
		const known = this.states.get(file);
		return known?.text === before ? known : { text: before, placed: this.fit(file, before, new Map()).kept };
	}

	async discardUnsaved(file: string): Promise<void> {
		this.deps.store.discardStaged(file);
		this.states.delete(file);
		if (this.seen?.file === file) this.gestures = [];
		const back = this.deps.store.takeBack(file, await this.deps.author());
		if (back.length) await this.deps.commit(...back);
	}

	async finish(): Promise<void> {
		const seen = this.seen;
		if (seen?.file && this.states.has(seen.file)) await this.run(seen.file, seen.text, this.deps.mode());
		if (this.deps.store.hasStaged) await this.deps.store.append();
		this.states.clear();
		this.seen = null;
		this.gestures = [];
		this.sides = {};
		this.placedFile = null;
		this.me = null;
		this.rejects = [];
		this.expected = [];
		this.accepts.clear();
	}

	async accept(t: CommentThread): Promise<void> {
		if (!isOpenSuggestion(t)) return;
		await this.settle();
		const at = this.states.get(t.file)?.placed.find((s) => s.id === t.id);
		await this.deps.commit(...(await this.anchorNow(t.file, t.id)), await this.decision(t, 'accepted'));
		this.drop(t.file, t.id);
		if (t.file !== this.deps.activeFile()) return;
		this.accepts.set(++this.acceptSeq, { file: t.file, thread: t, at });
		this.deps.markDecision?.(this.acceptSeq);
	}

	// the editors' undo of an Accept reopens the same thread where it stood; their redo accepts it again
	async revisitAccept(seq: number, undone: boolean): Promise<void> {
		const a = this.accepts.get(seq);
		if (!a) return;
		await this.settle();
		const again = undone ? undefined : placedAgain(this.states.get(a.file), a.thread.id, a.at);
		if (again) a.thread = this.deps.store.threads.find((t) => t.id === again.id) ?? a.thread;
		const moved = undone ? [] : await this.anchorNow(a.file, a.thread.id);
		await this.deps.commit(...moved, await this.decision(a.thread, undone ? undefined : 'accepted'));
		if (!undone) return this.drop(a.file, a.thread.id);
		if (this.states.has(a.file)) this.refit(a.file);
	}

	async reject(t: CommentThread): Promise<boolean> {
		const file = this.deps.activeFile();
		if (!isOpenSuggestion(t) || t.file !== file) return false;
		await this.settle();
		const text = this.deps.activeText();
		const state = this.states.get(file);
		const s = state?.text === text ? state.placed.find((x) => x.id === t.id) : undefined;
		if (!state || !s) return false;
		const decided = await this.decision(t, 'rejected');
		// in a session's log before the words come back, so nobody takes them for a new change
		const recorded = this.deps.commit(decided);
		if (!(await this.deps.applyEdit({ from: s.from, to: s.to, insert: s.restore }))) {
			await recorded;
			await this.deps.commit(await this.decision(t, undefined));
			return false;
		}
		const { text: next, placed: rest } = withoutRejected(state, s);
		this.states.set(file, { text: next, placed: rest });
		await recorded;
		await this.run(file, this.deps.activeText(), 'editing');
		const rejected = this.states.get(file);
		if (rejected) this.rejects = [...this.rejects.slice(1 - REJECTS_KEPT), { file, threads: [t], open: state, rejected }];
		this.show(this.states.get(file)?.text ?? next, this.states.get(file)?.placed ?? rest);
		this.deps.saveNow();
		return true;
	}

	/**
	 * An edit made for someone else, an agent: applied to the open file and recorded as a suggestion by
	 * `by` whatever mode the reader is in, with `note` as its first message. The reader's own typing is
	 * compared first so it stays theirs. Resolves the id of the suggestion it made or revised, or null when nothing was made.
	 */
	async suggestAs(by: string, edit: SourceEdit, note = ''): Promise<string | null> {
		const file = this.deps.activeFile();
		if (!file || !this.deps.compares()) return null;
		await this.settle();
		const before = this.deps.activeText();
		if (this.states.get(file)?.text !== before) return null;
		if (!(await this.deps.applyEdit(edit))) return null;
		const after = this.deps.activeText();
		// the edit's own landing, so the change it makes is one suggestion however many words it touches
		const { start, end } = commonEnds(before, after);
		const agent: AgentEdit = { by, note, gestures: [{ from: start, to: after.length - end }], opened: [] };
		this.seen = { path: this.seen?.path ?? null, file, text: after, rewraps: this.deps.rewraps() };
		this.gestures = [];
		await this.run(file, after, 'suggesting', undefined, agent);
		return agent.opened[0] ?? null;
	}

	private run(
		file: string,
		after: string,
		mode: EditMode,
		// the rule of the editor the text was typed in, not of one switched to while the comparison waited
		whitespace: WhitespaceChanges = (this.seen?.file === file && this.seen.text === after ? this.seen.rewraps : this.deps.rewraps())
			? 'paragraphs'
			: 'exact',
		agent?: AgentEdit
	): Promise<void> {
		const active = file === this.deps.activeFile();
		if (active && this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		const measured = this.seen?.file === file && this.seen.text === after;
		const gestures = agent ? agent.gestures : measured ? this.gestures : [];
		const sides = active && !agent ? this.sides : {};
		if (measured) this.gestures = [];
		if (active) this.sides = {};
		this.chain = this.chain.then(() => this.compare(file, after, mode, gestures, sides, whitespace, agent)).catch(() => undefined);
		return this.chain;
	}

	private async compare(
		file: string,
		after: string,
		mode: EditMode,
		gestures: TextSpan[],
		sides: Record<string, TypingSide>,
		whitespace: WhitespaceChanges,
		agent?: AgentEdit
	): Promise<void> {
		const state = this.states.get(file);
		if (!state || state.text === after) return;
		if (this.rejectedElsewhere(file, state, after)) return;
		// a guest suggesting reopens nothing: the recorder takes the returning words as a new suggestion of theirs
		if ((this.deps.compares() || mode === 'editing') && (await this.revisitReject(file, state, after))) return;
		if (mode === 'editing' && state.placed.length === 0) {
			this.states.set(file, { text: after, placed: [] });
			if (!this.deps.compares()) this.refit(file);
			return;
		}
		const author = agent?.by ?? (await this.deps.author());
		if (!agent) this.me = author;
		const current = this.states.get(file);
		if (!current || current.text !== state.text) return;
		const r = compareSuggestions({
			before: current.text,
			after,
			pending: current.placed,
			mode,
			author,
			gestures,
			sides,
			whitespace: dialectWhitespace(file, whitespace),
			newId: () => crypto.randomUUID()
		});
		this.states.set(file, { text: after, placed: r.placed });
		// a reader who does not record draws suggested typing at once; the recorder's events replace it
		if (!this.deps.compares()) {
			for (const c of r.changes) if (c.t === 'open') this.drawnHere.add(c.id);
			if (mode === 'editing') return this.refit(file);
			if (file === this.deps.activeFile()) this.show(after, r.placed);
			return;
		}
		for (const c of r.changes)
			if (agent && (c.t === 'open' || c.t === 'revise') && r.placed.some((s) => s.id === c.id && s.author === author))
				agent.opened.push(c.id);
		this.deps.store.stage(...changeEvents(file, after, r, author, agent?.note ?? '', this.deps.store.threads));
		if (file === this.deps.activeFile()) this.show(after, r.placed);
	}

	private rejectedElsewhere(file: string, state: FileState, after: string): boolean {
		const r = this.expected.find((x) => x.file === file && x.text === state.text && withoutRejected(state, x.s).text === after);
		if (!r) return false;
		this.expected = this.expected.filter((x) => x !== r);
		// not from `state`: the refit on the resolve event has already dropped `r.s` from it
		const now = withoutRejected(state, r.s, r.behind);
		this.states.set(file, now);
		if (file === this.deps.activeFile()) this.show(now.text, now.placed);
		return true;
	}

	// an undo of a Reject lands exactly on the file as it was before it, and brings the same threads back
	// rather than making the words a new change; a redo lands on the file after it and rejects it again
	private async revisitReject(file: string, state: FileState, after: string): Promise<boolean> {
		const mine = this.rejects.filter((r) => r.file === file);
		const undo = mine.findLast((r) => after === r.open.text && sameFileState(state, r.rejected));
		// by the thread a redo rejects, not by the whole file: typing undone and redone around it gets new ids
		const r = undo ?? mine.findLast((r) => r.threads.length === 1 && rejectedAgain(state, r.threads[0].id, after));
		if (!r) return false;
		const undone = r === undo;
		const events = await Promise.all(r.threads.map((t) => this.decision(t, undone ? undefined : 'rejected')));
		if (this.states.get(file) !== state) return true;
		const now = undone ? r.open : rejectedAgain(state, r.threads[0].id, after)!;
		if (!undone) Object.assign(r, { open: state, rejected: now });
		this.states.set(file, now);
		this.deps.store.stage(...events);
		if (file === this.deps.activeFile()) this.show(now.text, now.placed);
		return true;
	}

	private refit(file: string): void {
		const state = this.states.get(file)!;
		const lost = this.place(file, state.text);
		const now = this.states.get(file)!;
		if (file === this.deps.activeFile()) this.show(now.text, now.placed);
		this.deps.onLost?.(file, lost);
	}

	// where an accepted suggestion stands as it leaves the file, so an undo of the Accept finds it there again
	private async anchorNow(file: string, id: string): Promise<CommentEvent[]> {
		const state = file === this.deps.activeFile() ? this.states.get(file) : undefined;
		if (!state) return [];
		const by = await this.deps.author();
		const moved = movedAnchorEvents(state.text, state.placed, this.deps.store.forFile(file), by);
		return moved.filter((e) => e.t === 'anchor' && e.thread === id);
	}

	private async decision(t: CommentThread, decision: SuggestionDecision | undefined): Promise<CommentEvent> {
		return resolveEvent({ thread: t.id, resolved: !!decision, decision, by: await this.deps.author(), at: new Date().toISOString() });
	}

	private drop(file: string, id: string): void {
		const state = this.states.get(file);
		if (!state) return;
		const placed = state.placed.filter((s) => s.id !== id);
		this.states.set(file, { text: state.text, placed });
		if (file === this.deps.activeFile()) this.show(state.text, placed);
	}

	private async learnAuthor(): Promise<void> {
		const me = await this.deps.author();
		if (me === this.me) return;
		this.me = me;
		const state = this.states.get(this.deps.activeFile() ?? '');
		if (state) this.show(state.text, state.placed);
	}

	private show(text: string, placed: PlacedSuggestion[]): void {
		const marks = suggestionMarks(text, placed, this.me);
		const shown = activeSuggestions.current;
		if (marks.length === shown.length && marks.every((m, i) => sameMark(m, shown[i]))) return;
		activeSuggestions.current = marks;
	}
}
