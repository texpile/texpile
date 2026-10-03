// Review comments as workspace state: the log, the threads resolved against the open file, and the
// actions the panel and the editor call.
//
// Kept out of WorkspaceView the way the other pipelines are - the view is already long, and none of
// this needs anything from it but the workspace root and a way to open a file.
import { untrack } from 'svelte';
import { CommentStore, relativeTo, type CommentLogShare } from '$lib/comments/store.svelte';
import { buildAnchor, resolveAnchor, type CommentAnchor } from '$lib/comments/anchor';
import {
	anchorEvent,
	deleteEvent,
	deleteMessageEvent,
	editEvent,
	moveEvent,
	openEvent,
	replyEvent,
	resolveEvent,
	parseLog,
	type CommentEvent,
	type CommentMessage,
	type CommentThread
} from '$lib/comments/log';
import { lineOf } from '$lib/comments/anchorLocate';
import { resolveAuthor, forgetAuthor } from '$lib/comments/author';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';
import { isSuggestion, touchesSuggestions } from '$lib/comments/suggest';
import { activeSuggestions, suggestionVisibility } from '$lib/comments/activeSuggestions.svelte';
import type { EditMode } from '$lib/comments/suggestCompare';
import { SuggestionsController, type SourceEdit } from './suggestionsController';
import type { RemoteEdit } from './suggestionStates';
import { driftedAnchors, placeThreads, withAnchors } from './threadPlacement';
import { ghostThreads, placementBadges } from './threadBadges';
import { PlacementVerdicts } from './placementVerdicts';

type Deps = {
	/** absolute workspace root, or null before a folder is open */
	root: () => string | null;
	/** the Preferences name; blank falls back to git */
	preferredAuthor: () => string;
	/** whether there is a name to sign with, asking for one when there is none; false when the reader would not give one */
	ensureName?: () => Promise<boolean>;
	/**
	 * The open file's CURRENT text. `reanchor` snapshots the text only when a file opens, which is
	 * fine for re-searching but wrong for building NEW anchors: in a shared session the buffer
	 * drifts under remote edits between open and gesture, and a quote sliced from the stale
	 * snapshot detaches the thread everywhere. Everything offset-shaped refreshes through this.
	 */
	activeText?: () => string;
	/** open a file and put the caret on a line (1-based) */
	openFileAt: (absPath: string, line: number) => void;
	/**
	 * Reveal a thread in the visual editor, if that is where the reader is and the thread is drawn
	 * there. False means "not from here" and the line jump is used instead.
	 */
	revealInVisual?: (id: string) => boolean;
	liveAnchors?: (text: string) => Map<string, CommentAnchor> | null;
	mode?: () => EditMode;
	applyEdit?: (edit: SourceEdit) => Promise<boolean>;
	markDecision?: (seq: number) => void;
	saveNow?: () => void;
	compares?: () => boolean;
	rewraps?: () => boolean;
};

export class CommentsController {
	readonly store = new CommentStore();
	/** the thread the reader is looking at, highlighted in both the panel and the editor */
	selected = $state<string | null>(null);
	toReveal = $state<{ id: string; seq: number } | null>(null);
	/** where each thread on the ACTIVE file sits now; what the editor decorates */
	ranges = $state<CommentRange[]>([]);
	/** threads on the active file whose quote is gone from it */
	orphaned = $state<Set<string>>(new Set());
	/**
	 * Threads placed in the FILE but not drawable in the current view - the visual editor reports
	 * them after each placement pass. Distinct from orphaned on purpose: an orphan lost its text,
	 * these merely have no rendered text to sit on, and switching to source brings them back.
	 * Empty whenever the source editor is the view; it draws everything it can resolve.
	 */
	private hiddenNow = $state<Set<string>>(new Set());
	/**
	 * Threads on the active file that were found, but whose surroundings changed (see
	 * ResolvedAnchor.weak). If the file holds their sentence twice the highlight may be on the
	 * other copy, so the panel asks the reader to check. Measured, never recorded: it is a fact
	 * about this text, and the next edit can change it either way.
	 */
	weak = $state<Set<string>>(new Set());
	/**
	 * A selection the reader has asked to comment on, before they have written anything.
	 *
	 * Held here rather than written straight to the log, because an empty thread on disk is a thread
	 * every other reader has to scroll past. The panel shows a composer for it and only the first
	 * message turns it into a real thread.
	 *
	 * Two shapes: source-mode offsets into `text` (the anchor is built at commit), or a ready-made
	 * anchor from the visual editor, whose positions mean nothing here.
	 */
	pending = $state<{ quote: string; from?: number; to?: number; anchor?: CommentAnchor } | null>(null);

	/** workspace-relative path of the file `ranges` was computed against */
	private file: string | null = null;
	private text = '';
	/** what we MEASURED on the open file, as opposed to what the log remembers about the others */
	private activeLost = new Set<string>();
	private activeHidden = new Set<string>();
	/** the reader is in the visual editor; see setVisualMode for why the hidden badge depends on it */
	private visual = $state(false);
	/** a thread we are opening a different file for; selected once that file re-anchors */
	private pendingOpen: string | null = null;
	private lastWords = new Map<string, CommentAnchor>();
	private carried: { text: string; anchors: Map<string, CommentAnchor> } | null = null;
	knownAnchors = $state.raw<Map<string, CommentAnchor>>(new Map());

	withKnownAnchors(threads: CommentThread[]): CommentThread[] {
		return withAnchors(threads, this.knownAnchors);
	}

	readonly suggestions: SuggestionsController;
	private readonly verdicts = new PlacementVerdicts({
		store: this.store,
		author: () => this.author(),
		commit: (...events) => this.commit(...events)
	});

	constructor(private readonly deps: Deps) {
		this.suggestions = new SuggestionsController({
			store: this.store,
			activeFile: () => this.file,
			activeText: () => this.fresh(),
			mode: () => deps.mode?.() ?? 'editing',
			author: () => this.author(),
			commit: (...events) => this.commit(...events),
			applyEdit: (edit) => deps.applyEdit?.(edit) ?? Promise.resolve(false),
			markDecision: (seq) => deps.markDecision?.(seq),
			saveNow: () => deps.saveNow?.(),
			compares: () => deps.compares?.() ?? true,
			rewraps: () => deps.rewraps?.() ?? false,
			onLost: (file, lost) => this.suggestionsLost(file, lost)
		});
	}

	get notVisible(): Set<string> {
		const hidden = suggestionVisibility.current.hidden;
		return this.visual && hidden.size ? new Set([...this.hiddenNow, ...hidden]) : this.hiddenNow;
	}

	get partial(): Set<string> {
		return this.visual ? suggestionVisibility.current.partial : new Set();
	}

	get threads(): CommentThread[] {
		return this.store.threads;
	}

	get ghosts(): Set<string> {
		return ghostThreads(this.ranges, this.store.threads, this.knownAnchors);
	}
	get activeFile(): string | null {
		return this.file;
	}

	async load(root: string | null): Promise<void> {
		if (root !== this.store.root) await this.suggestions.finish();
		forgetAuthor();
		this.selected = null;
		this.pendingOpen = null;
		this.pending = null;
		this.activeHidden = new Set();
		this.activeLost = new Set();
		this.hiddenNow = new Set();
		this.weak = new Set();
		this.knownAnchors = new Map();
		this.lastWords.clear();
		this.carried = null;
		await this.store.load(root);
		const ghosts = this.store.threads.filter((t) => !t.anchor.quote && !isSuggestion(t));
		if (ghosts.length && this.store.writable) {
			const by = await this.author();
			const at = new Date().toISOString();
			await this.commit(...ghosts.map((t) => deleteEvent({ thread: t.id, by, at })));
		}
	}

	/**
	 * Re-resolve every thread on this file against its current text.
	 *
	 * Called when a file opens and when its text is replaced from outside - NOT on every keystroke.
	 * While the editor is live, CodeMirror maps the decorations through each transaction, which is
	 * exact; re-searching on top of that would fight it and could snap a range somewhere else
	 * mid-edit.
	 */
	reanchor(absPath: string | null, text: string): void {
		const root = this.deps.root();
		const file = absPath && root ? relativeTo(root, absPath) : null;
		if (file !== this.file && this.knownAnchors.size > 0) this.knownAnchors = new Map();
		this.file = file;
		this.text = text;
		this.resolve();
	}

	carryLive(): void {
		const text = this.fresh();
		const anchors = this.deps.liveAnchors?.(text);
		this.carried = anchors ? { text, anchors } : null;
	}

	/**
	 * Re-read the log after someone else wrote it - a `git pull`, a second window, an agent.
	 *
	 * Keeps the selection, unlike load(): this is the same project, just with more in it, and having
	 * the panel jump away because a colleague's comment arrived would be its own bug.
	 */
	async refresh(): Promise<void> {
		// a guest has no file to re-read: its log is the session's, and disk is the host's
		if (!this.store.writable) return;
		await this.store.reload();
		this.resolve();
	}

	/**
	 * Everything the panel should badge as detached: what we just measured on the open file, plus
	 * what the log remembers about every other file.
	 *
	 * The live answer WINS for the open file. A recorded status is only ever the last thing some
	 * Texpile saw; for the file in front of the reader we have the text itself, so the recording is
	 * the weaker evidence and must not survive next to it.
	 */
	private applyOrphans(): void {
		// nothing is "not in this view" while the view is source; see setVisualMode
		const { orphaned, hidden } = placementBadges(this.store.threads, this.file, this.activeLost, this.activeHidden, this.visual);
		this.orphaned = orphaned;
		this.hiddenNow = hidden;
	}

	/**
	 * Which editor the reader is looking at, because "not in this view" is a claim about the view.
	 *
	 * In source mode NOTHING is hidden - the source editor draws every thread it can resolve - so the
	 * badge and its "switch to source mode to see it" note are simply false there, for the open file
	 * and for the remembered ones alike. Gating on the mode is what stops the panel telling a reader
	 * already in source to go to source.
	 *
	 * Leaving visual also drops what this window measured, and deliberately records NOTHING: source
	 * has not discovered those threads became drawable, it has stopped looking, and writing
	 * `hidden: false` would overwrite a true observation with the absence of one.
	 */
	setVisualMode(visual: boolean): void {
		if (this.visual === visual) return;
		this.visual = visual;
		if (!visual) this.activeHidden = new Set();
		this.applyOrphans();
	}

	/** the live text when the view provides it, else the last reanchor snapshot */
	private fresh(): string {
		const t = this.deps.activeText?.();
		if (t !== undefined) this.text = t;
		return this.text;
	}

	/** recompute the active file's ranges from the current log and text */
	private resolve(): void {
		if (!this.file) {
			this.ranges = [];
			this.activeLost = new Set();
			this.weak = new Set();
			this.suggestions.clear();
			this.applyOrphans();
			return;
		}
		const text = this.fresh();
		const carried = this.carried;
		this.carried = null;
		const live = this.deps.liveAnchors?.(text) ?? null;
		const handed = carried && carried.text === text ? carried.anchors : null;
		const placed = placeThreads(
			this.store.forFile(this.file),
			text,
			(id) => live?.get(id) ?? handed?.get(id) ?? null,
			untrack(() => this.knownAnchors),
			this.lastWords
		);
		const { ranges, lost, weak } = placed;
		for (const id of this.suggestions.place(this.file, text)) lost.add(id);
		if (placed.known) this.knownAnchors = placed.known;
		this.ranges = ranges;
		this.activeLost = lost;
		this.weak = weak;
		this.applyOrphans();
		void this.verdicts.detached(this.file, lost);
		if (this.pendingOpen) {
			const target = this.pendingOpen;
			this.pendingOpen = null;
			this.selected = target;
			this.scrollTo(target);
		}
	}

	private suggestionsLost(file: string, lost: Set<string>): void {
		if (file !== this.file) return;
		const ids = new Set(
			this.store
				.forFile(file)
				.filter(isSuggestion)
				.map((t) => t.id)
		);
		const next = new Set([...this.activeLost].filter((id) => !ids.has(id)));
		for (const id of lost) next.add(id);
		this.activeLost = next;
		this.applyOrphans();
	}

	/**
	 * The visual editor reporting which threads it could not draw, for the document it just placed.
	 *
	 * Same delta discipline as recordDetached, and the same reason. `file` is passed rather than read
	 * from `this` because the report can land a beat after a file switch.
	 */
	async recordHidden(file: string, lost: Set<string>): Promise<void> {
		this.activeHidden = file === this.file ? lost : new Set();
		this.applyOrphans();
		await this.verdicts.hidden(file, lost);
	}

	/**
	 * The reader selected text and asked to comment; the panel takes it from here.
	 *
	 * The anchor is built NOW, against the live text the offsets refer to - not at commit. The
	 * composer stays open while collaborators keep editing, and offsets held raw across that
	 * window pointed into a document that no longer existed; the anchor's quote and context
	 * survive it, exactly as the visual editor's ready-made anchors do.
	 */
	beginAdd(from: number, to: number): void {
		if (!this.file || to <= from) return;
		const text = this.fresh();
		if (to > text.length) return;
		this.pending = { from, to, quote: text.slice(from, to), anchor: buildAnchor(text, from, to) };
		this.selected = null;
	}

	/**
	 * The visual editor's version of beginAdd: it hands over an anchor it built through the source
	 * map, a range of the file like any other, so nothing here converts.
	 */
	beginAddAnchored(anchor: CommentAnchor | null): void {
		if (!this.file || !anchor) return;
		this.pending = { quote: anchor.quote, anchor };
		this.selected = null;
	}

	cancelAdd(): void {
		this.pending = null;
	}

	/** turn the pending selection into a thread; no-op if there is nothing to write */
	async commitAdd(body: string): Promise<void> {
		const p = this.pending;
		if (!p) return;
		this.pending = null;
		if (!p.anchor || !this.file) return;
		const id = await this.openOn(this.file, p.anchor, body);
		if (id) this.selected = id;
	}

	/**
	 * Open a thread on `file` at a ready-made anchor: the panel's commit, and the MCP tools' way in.
	 *
	 * On the active file the new thread gets its highlight now, re-resolved rather than pushed from
	 * the gesture's offsets: the composer window may have seen remote edits, and the search lands on
	 * the text wherever it sits NOW (visual-editor anchors are source-dialect by then too, see
	 * beginAddAnchored). Returns the id, or null when there was nothing to write.
	 */
	async openOn(file: string, anchor: CommentAnchor, body: string, by?: string): Promise<string | null> {
		const root = this.deps.root();
		if (!root || !body.trim()) return null;
		const id = crypto.randomUUID();
		await this.commit(openEvent({ id, file, by: await this.author(by), body: body.trim(), anchor, at: new Date().toISOString() }));
		if (file === this.file) this.placeOne(id, anchor, false);
		return id;
	}

	/**
	 * Re-pin a thread to `anchor` in `file`, after an edit rewrote the text it sat on. An event,
	 * not a rewrite of the open line, same as move: the log is append-only.
	 */
	async moveAnchor(thread: CommentThread, anchor: CommentAnchor, file: string, by?: string): Promise<void> {
		const moved = file !== thread.file;
		await this.commit(
			anchorEvent({ thread: thread.id, anchor, file: moved ? file : undefined, by: await this.author(by), at: new Date().toISOString() })
		);
		if (file === this.file) this.placeOne(thread.id, anchor, thread.resolved);
		else if (thread.file === this.file) this.dropRange(thread.id);
	}

	async reattach(thread: CommentThread, from: number, to: number): Promise<void> {
		if (!this.file || to <= from) return;
		const text = this.fresh();
		if (to > text.length) return;
		await this.moveAnchor(thread, buildAnchor(text, from, to), this.file);
	}

	async reattachAnchored(thread: CommentThread, anchor: CommentAnchor): Promise<void> {
		if (!this.file) return;
		await this.moveAnchor(thread, anchor, this.file);
	}

	async syncAnchorsToText(absPath: string, text: string): Promise<void> {
		const root = this.deps.root();
		if (!root || !this.file || !this.store.writable) return;
		if (relativeTo(root, absPath) !== this.file) return;
		const live = this.deps.liveAnchors?.(text);
		if (!live) return;
		const moved = driftedAnchors(this.store.forFile(this.file), text, live);
		if (moved.length === 0) return;
		const by = await this.author();
		const at = new Date().toISOString();
		await this.commit(...moved.map((m) => anchorEvent({ thread: m.id, anchor: m.anchor, by, at })));
		for (const m of moved) this.placeOne(m.id, m.anchor, false);
	}

	/** returns the new message's id, or null if there was nothing to write */
	async reply(thread: CommentThread, body: string, by?: string): Promise<string | null> {
		if (!body.trim()) return null;
		// an MCP client signs with its own name; a new comment asked before it was begun (workspaceActionSurfaces)
		if (!by && !(await (this.deps.ensureName?.() ?? true))) return null;
		const id = crypto.randomUUID();
		await this.commit(replyEvent({ id, thread: thread.id, by: await this.author(by), body: body.trim(), at: new Date().toISOString() }));
		return id;
	}

	async setResolved(thread: CommentThread, resolved: boolean, by?: string): Promise<void> {
		await this.commit(resolveEvent({ thread: thread.id, by: await this.author(by), resolved, at: new Date().toISOString() }));
		if (isSuggestion(thread)) {
			if (thread.file === this.file) this.resolve();
			return;
		}
		this.ranges = this.ranges.map((r) => (r.id === thread.id ? { ...r, resolved } : r));
	}

	/** one thread's range on the active file, from the live text; lost there when the quote is not */
	private placeOne(id: string, anchor: CommentAnchor, resolved: boolean): void {
		const text = this.fresh();
		const hit = anchor.quote ? resolveAnchor(text, anchor) : { from: anchor.start, to: anchor.end, exact: true, weak: false };
		const rest = this.ranges.filter((r) => r.id !== id);
		this.ranges = hit ? [...rest, { id, from: hit.from, to: hit.to, resolved }] : rest;
		if (hit) this.activeLost.delete(id);
		else this.activeLost.add(id);
		this.setWeak(id, hit?.weak === true);
		this.applyOrphans();
	}

	/** a thread that left the active file, by deletion or by moving elsewhere */
	private dropRange(id: string): void {
		this.ranges = this.ranges.filter((r) => r.id !== id);
		this.activeLost.delete(id);
		this.setWeak(id, false);
		this.applyOrphans();
		if (this.selected === id) this.selected = null;
	}

	private setWeak(id: string, on: boolean): void {
		if (this.weak.has(id) === on) return;
		const next = new Set(this.weak);
		if (on) next.add(id);
		else next.delete(id);
		this.weak = next;
	}

	/** rewrite one message. Not restricted to your own: the log is a file anyone can edit anyway */
	async editMessage(message: CommentMessage, body: string): Promise<void> {
		if (!body.trim() || body.trim() === message.body) return;
		await this.commit(editEvent({ message: message.id, body: body.trim(), by: await this.author(), at: new Date().toISOString() }));
	}

	/** drop one message; the fold drops the thread with it if that was the last of it */
	async removeMessage(thread: CommentThread, message: CommentMessage): Promise<void> {
		await this.commit(deleteMessageEvent({ message: message.id, by: await this.author(), at: new Date().toISOString() }));
		if (thread.messages.length <= 1) {
			this.ranges = this.ranges.filter((r) => r.id !== thread.id);
			if (this.selected === thread.id) this.selected = null;
		}
	}

	/** reveal a thread: scroll to it here, or open the file it is on and scroll once it lands */
	open(thread: CommentThread): void {
		this.selected = thread.id;
		this.toReveal = { id: thread.id, seq: (this.toReveal?.seq ?? 0) + 1 };
		if (thread.file === this.file) {
			this.scrollTo(thread.id);
			return;
		}
		const root = this.deps.root();
		if (!root) return;
		this.pendingOpen = thread.id;
		this.deps.openFileAt(`${root}/${thread.file}`, 1);
	}

	/** everything this side originates: state, then disk if there is any; a session's log shares it on the way */
	private async commit(...events: CommentEvent[]): Promise<void> {
		await this.store.append(...events);
	}

	/** follow a session's log: `seed` puts this side's own log in first, the host's part */
	startSharing(share: CommentLogShare, seed: boolean): void {
		this.store.startSharing(share, seed);
		this.suggestions.answered();
		this.resolve();
	}

	stopSharing(): void {
		this.store.stopSharing();
	}

	/**
	 * Someone else changed the session's log: `added` in the order it stands, `dropped` when lines went.
	 *
	 * A plain comment only moves its own range. Re-resolving the whole file would re-search threads
	 * the open editor has been mapping exactly, and could snap one onto another copy of its quote.
	 */
	received(added: string[], dropped: boolean): void {
		const events = parseLog(added.join('\n'));
		const before = this.store.threads;
		// before the refit below forgets where it stood: its words come back as the rejecter's edit
		for (const e of events) if (e.t === 'resolve' && e.decision === 'rejected') this.suggestions.expectReject(e.thread);
		this.store.follow();
		void this.store.flush();
		if (dropped || events.some((e) => touchesSuggestions(e, before, events))) {
			this.suggestions.answered();
			this.resolve();
			return;
		}
		for (const e of events) this.applyIngested(e);
	}

	private applyIngested(event: CommentEvent): void {
		if (event.t === 'open' && event.file === this.file) {
			this.placeOne(event.id, event.anchor, false);
		} else if (event.t === 'resolve') {
			this.ranges = this.ranges.map((r) => (r.id === event.thread ? { ...r, resolved: event.resolved } : r));
		} else if (event.t === 'delete') {
			this.dropRange(event.thread);
		} else if (event.t === 'anchor') {
			const t = this.store.threads.find((x) => x.id === event.thread);
			if (t && t.file === this.file) this.placeOne(t.id, t.anchor, t.resolved);
			else this.dropRange(event.thread);
		}
	}

	/**
	 * A file or directory was renamed/moved in the tree: its threads follow, via a `move` event.
	 *
	 * An event rather than a rewrite of the open lines, because the log is append-only - that is
	 * what lets git merge it - and because undo replays the rename backwards, which then simply
	 * appends the reverse move. Only written when a thread is actually affected, so renaming files
	 * nobody commented on does not grow the log. External renames (vim, git mv) cannot be seen from
	 * here; those threads orphan, which the panel already explains.
	 */
	async fileMoved(fromAbs: string, toAbs: string): Promise<void> {
		const root = this.deps.root();
		if (!root) return;
		const from = relativeTo(root, fromAbs);
		const to = relativeTo(root, toAbs);
		if (from === to) return;
		this.suggestions.moved(from, to);
		if (this.file && (this.file === from || this.file.startsWith(from + '/'))) this.file = to + this.file.slice(from.length);
		if (!this.store.threads.some((t) => t.file === from || t.file.startsWith(from + '/'))) return;
		await this.commit(moveEvent({ from, to, by: await this.author(), at: new Date().toISOString() }));
		this.resolve();
	}

	/** a collaborator's change to a file, as it applies here; see SuggestionsController.remoteEdit */
	remoteEdit(file: string, before: string, after: string, edit: RemoteEdit): void {
		void this.suggestions.remoteEdit(file, before, after, edit);
	}

	/** before a collaborator's changes go to disk, so the log never trails the file */
	async beforeRemoteWrite(file: string, content: string): Promise<void> {
		if (this.store.writable) await this.suggestions.beforeWrite(file, content);
	}

	private scrollTo(id: string): void {
		// The visual editor first, when that is where the reader is: it has already placed this thread
		// on the exact characters it covers, whereas the line jump below has to push a source line back
		// through the block map, which is block-granular - so a comment on the last clause of a long
		// paragraph landed at the top of the paragraph. Falls through when the reader is in source, or
		// when this thread is one the visual view could not draw.
		if (this.deps.revealInVisual?.(id)) return;
		const hit = this.ranges.find((r) => r.id === id) ?? activeSuggestions.current.find((s) => s.id === id);
		// an orphaned thread has nowhere to scroll to; the panel says so rather than jumping to line 1
		if (hit) this.deps.openFileAt(`${this.deps.root()}/${this.file}`, lineOf(this.text, hit.from));
	}

	/** who signs an event: a caller's own name (an MCP client), else this workspace's author */
	author(by?: string): Promise<string> {
		const own = by?.trim();
		return own ? Promise.resolve(own) : resolveAuthor(this.deps.root(), this.deps.preferredAuthor());
	}
}
