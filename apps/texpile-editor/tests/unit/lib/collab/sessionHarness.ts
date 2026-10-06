// A shared session for the suggestion tests, wired the way the app wires it: the real session engine
// (sealed frames over a blind relay), the host's text buffers writing every change to its disk,
// one CommentsController per side, and real CodeMirror editors bound to the shared Y.Text through
// y-codemirror, the same binding the source editor uses. Each test file mocks the fs modules onto
// `disk` before importing this.
import * as Y from 'yjs';
import { expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { yCollab } from 'y-codemirror.next';
import { deriveSessionKeys } from '$lib/collab/e2e/keys';
import { generateShareCode } from '$lib/collab/e2e/shareCode';
import { CollabSession, textOf, type SessionEvents } from '$lib/collab/session';
import { EDIT_ORIGIN, changedSpans } from '$lib/collab/sharedFiles';
import { TextBuffers } from '$lib/buffers/textBuffers';
import { spliceDiff } from '$lib/collab/spliceDiff';
import type { RelayNotice } from '$lib/collab/protocol';
import { commentLogOf, shareComments } from '$lib/collab/sharedComments';
import type { Transport, TransportStatus } from '$lib/collab/transport';
import { parseLog, serializeLog, type CommentEvent, type CommentThread } from '$lib/comments/log';
import type { EditMode, PlacedSuggestion } from '$lib/comments/suggestCompare';
import { CommentsController } from '$lib/workspace/commentsController.svelte';
import { activeSuggestions, editMode } from '$lib/comments/activeSuggestions.svelte';
import { cmSuggestions, fitsSuggestion, setSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import { disk, resetDisk } from './sessionDisk';

export const FILE = 'main.tex';

class FakeHub {
	transports = new Set<FakeTransport>();
	deliver(from: FakeTransport, data: Uint8Array): void {
		for (const t of this.transports) if (t !== from && !t.closed) setTimeout(() => t.onMessage?.(data, from.role === 'host'), 0);
	}
}

class FakeTransport implements Transport {
	onMessage: ((data: Uint8Array, fromHost: boolean) => void) | null = null;
	onNotice: ((n: RelayNotice) => void) | null = null;
	onStatus: ((s: TransportStatus, detail?: string) => void) | null = null;
	closed = false;
	constructor(
		private hub: FakeHub,
		readonly role: 'host' | 'guest'
	) {}
	start(): void {
		this.closed = false;
		this.hub.transports.add(this);
		setTimeout(() => this.onStatus?.('connected'), 0);
	}
	send(data: Uint8Array<ArrayBuffer>): void {
		if (!this.closed) this.hub.deliver(this, data);
	}
	/** drop off the relay without ending the session, as a lost connection does */
	drop(): void {
		this.closed = true;
		this.hub.transports.delete(this);
	}
	close(): void {
		this.drop();
	}
}

export async function until(cond: () => boolean, ms = 10000, what = 'condition'): Promise<void> {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error(`${what} not reached in time`);
		await new Promise((r) => setTimeout(r, 5));
	}
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export const logged = () => parseLog(disk['.texpile/comments.jsonl'] ?? '');

/** the open suggestions a side holds, as [author, the words now, the words before] */
export function openSuggestions(threads: CommentThread[]): [string, string, string][] {
	return threads
		.filter((t) => t.restore !== undefined && !t.resolved)
		.map((t) => [t.messages[0].by, t.anchor.quote, t.restore!] as [string, string, string])
		.sort();
}

type Placed = PlacedSuggestion[];

/** where a controller has the suggestions on the file right now */
export function placedOn(ctl: CommentsController): { text: string; placed: Placed } | undefined {
	return (ctl.suggestions as unknown as { states: Map<string, { text: string; placed: Placed }> }).states.get(FILE);
}

/** the file with every placed suggestion rejected: what it said before anyone suggested anything */
export function withAllRejected(text: string, placed: Placed): string {
	let out = text;
	// last first, so several deletions at one spot go back in the order they are placed in
	for (const s of [...placed].sort((a, b) => a.from - b.from || a.to - b.to).reverse())
		out = out.slice(0, s.from) + s.restore + out.slice(s.to);
	return out;
}

/** a CodeMirror editor on a shared Y.Text, as the source editor mounts it in a session */
function sharedEditor(ytext: Y.Text, awareness: CollabSession['awareness'], onText: (text: string) => void) {
	const undo = new Y.UndoManager(ytext);
	const view = new EditorView({
		state: EditorState.create({
			doc: ytext.toString(),
			extensions: [
				yCollab(ytext, awareness, { undoManager: undo }),
				EditorView.updateListener.of((u) => {
					if (u.docChanged) onText(u.state.doc.toString());
				})
			]
		}),
		parent: document.body
	});
	return {
		view,
		undo,
		text: () => view.state.doc.toString(),
		change(from: number, to: number, insert: string) {
			view.dispatch({ changes: { from, to, insert }, userEvent: insert ? 'input.type' : 'delete' });
		},
		destroy: () => view.destroy()
	};
}

type Editor = ReturnType<typeof sharedEditor>;

type Stroke = [from: number, to: number, insert: string];

function find(text: string, words: string): number {
	const at = text.indexOf(words);
	if (at < 0) throw new Error(`no "${words}" in ${JSON.stringify(text)}`);
	return at;
}

// each key is worked out against the text as it stands after the one before
const strokes = {
	*type(text: () => string, words: string, mark: string): Generator<Stroke> {
		for (const ch of words) {
			const at = find(text(), mark);
			yield [at, at, ch];
		}
	},
	*typeAt(at: number, words: string): Generator<Stroke> {
		for (const [i, ch] of [...words].entries()) yield [at + i, at + i, ch];
	},
	*erase(text: () => string, words: string): Generator<Stroke> {
		const at = find(text(), words);
		for (let i = words.length; i > 0; i--) yield [at + i - 1, at + i, ''];
	},
	*cut(text: () => string, words: string): Generator<Stroke> {
		const at = find(text(), words);
		yield [at, at + words.length, ''];
	},
	*replace(text: () => string, words: string, by: string): Generator<Stroke> {
		const at = find(text(), words);
		yield [at, at + words.length, by.slice(0, 1)];
		yield* strokes.typeAt(at + 1, by.slice(1));
	}
};

function keysFor<R>(text: () => string, press: (keys: Iterable<Stroke>) => R) {
	return {
		/** type `words` just before the first `mark` */
		type: (words: string, mark: string) => press(strokes.type(text, words, mark)),
		/** type `words` at an offset */
		typeAt: (at: number, words: string) => press(strokes.typeAt(at, words)),
		/** delete the first `words`, a backspace at a time from its end */
		erase: (words: string) => press(strokes.erase(text, words)),
		/** select the first `words` and press Delete */
		cut: (words: string) => press(strokes.cut(text, words)),
		/** select `words` and type over them */
		replace: (words: string, by: string) => press(strokes.replace(text, words, by))
	};
}

/** typing and deleting in an editor the way a person does: one keystroke per transaction */
function keyboard(ed: Editor) {
	return keysFor(ed.text, (keys) => {
		for (const [from, to, insert] of keys) ed.change(from, to, insert);
	});
}

export type Keys = ReturnType<typeof keysFor<unknown>>;

/**
 * One person on their own in Suggesting, the reference for what the host should record for a guest
 * typing the same keys: a source editor with the suggestion marks drawn, and every key settled
 * before the next.
 */
export async function startSolo(o: { text: string; name: string; log?: CommentEvent[] }) {
	resetDisk({ [FILE]: o.text, '.texpile/comments.jsonl': serializeLog(o.log ?? []) });
	editMode.current = 'suggesting';
	const view: EditorView = new EditorView({
		state: EditorState.create({ doc: o.text, extensions: [cmSuggestions()] }),
		parent: document.body
	});
	const text = () => view.state.doc.toString();
	const change = (from: number, to: number, insert: string) =>
		view.dispatch({ changes: { from, to, insert }, userEvent: insert ? 'input.type' : 'delete' });
	const ctl = new CommentsController({
		root: () => '/w',
		preferredAuthor: () => o.name,
		openFileAt: () => {},
		activeText: text,
		mode: () => 'suggesting',
		applyEdit: async (e) => {
			change(e.from, e.to, e.insert);
			return true;
		},
		saveNow: () => {}
	});
	await ctl.load('/w');
	ctl.reanchor('/w/' + FILE, text());
	ctl.suggestions.textChanged('/w/' + FILE, text());
	// as SourceEditor feeds the marks back to the editor after each comparison
	const draw = () => {
		const marks = activeSuggestions.current;
		if (!marks.every((r) => fitsSuggestion(view.state, r))) return;
		view.dispatch({ effects: setSuggestionRanges.of(marks.map(({ id, from, to, restore, mine }) => ({ id, from, to, restore, mine }))) });
	};
	await ctl.suggestions.settle();
	draw();
	return {
		ctl,
		view,
		text,
		keys: keysFor(text, async (keys) => {
			for (const [from, to, insert] of keys) {
				change(from, to, insert);
				ctl.suggestions.textChanged('/w/' + FILE, text());
				await ctl.suggestions.settle();
				draw();
			}
		}),
		close() {
			view.destroy();
			editMode.current = 'editing';
			activeSuggestions.current = [];
		}
	};
}

export type SessionOptions = {
	text: string;
	log?: CommentEvent[];
	/** whether the host has the file open in its editor */
	hostOpens?: boolean;
	/** false: an older host that never says whether it is suggesting */
	hostAdvertises?: boolean;
};

export async function startSession(o: SessionOptions) {
	resetDisk({ [FILE]: o.text, '.texpile/comments.jsonl': serializeLog(o.log ?? []) });
	const key = (await deriveSessionKeys(generateShareCode())).contentKey;
	const hub = new FakeHub();
	const cleanups: (() => void)[] = [];
	const party = (role: 'host' | 'guest', name: string, events: SessionEvents, buffers?: TextBuffers) => {
		const doc = buffers?.shared ?? new Y.Doc();
		const transport = new FakeTransport(hub, role);
		const session = new CollabSession({
			doc,
			awareness: buffers?.awareness,
			transport,
			key,
			role,
			user: { name, color: '#123456' },
			events
		});
		transport.start();
		cleanups.push(() => session.destroy());
		return { doc, session, transport };
	};

	// host
	const writes: { tex: string; log: CommentEvent[] }[] = [];
	const buffers = new TextBuffers(
		'/w',
		{
			readBytes: async (p) => new TextEncoder().encode(disk[p.replace(/^\/w\//, '')]),
			writeText: async (p, content) => {
				const rel = p.replace(/^\/w\//, '');
				if (rel === FILE) writes.push({ tex: content, log: logged() });
				disk[rel] = content;
			},
			listFiles: async () => [{ rel: FILE, size: disk[FILE].length }]
		},
		(root, rel) => `${root}/${rel}`
	);
	cleanups.push(() => buffers.destroy());
	const host = party('host', 'louis', {}, buffers);
	let hostMode: EditMode = 'editing';
	if (o.hostAdvertises !== false) host.session.setSuggesting(false);
	let hostEditor: Editor | null = null;
	let hostText = o.text;
	const hostCtl = new CommentsController({
		root: () => '/w',
		preferredAuthor: () => '',
		openFileAt: () => {},
		activeText: () => (hostEditor ? hostEditor.text() : hostText),
		mode: () => hostMode,
		applyEdit: async (e) => {
			if (!hostEditor) return false;
			hostEditor.change(e.from, e.to, e.insert);
			return true;
		},
		saveNow: () => {}
	});
	// as WorkspaceView and hostStore wire it: the open file records the host's own typing first
	buffers.hooks.beforeWrite = (path, content) => {
		const rel = path.replace(/^\/w\//, '');
		return hostEditor && rel === FILE ? hostCtl.suggestions.beforeSave(rel, content) : hostCtl.beforeRemoteWrite(rel, content);
	};
	buffers.senderOf = (origin) => host.session.senderOf(origin);
	buffers.onRemoteChange = (rel, before, after, from, gestures) =>
		hostCtl.remoteEdit(rel, before, after, { ...host.session.authorOf(from), gestures });
	await buffers.sharing.start();
	await hostCtl.load('/w');
	// as workspaceComments shares it
	cleanups.push(shareComments(hostCtl, commentLogOf(host.doc), 'host'));

	function openOnHost(): void {
		const ytext = textOf(host.doc, FILE);
		// the app feeds the controller from an effect, so after the change has fully landed
		hostEditor = sharedEditor(ytext, host.session.awareness, (text) =>
			queueMicrotask(() => hostCtl.suggestions.textChanged('/w/' + FILE, text))
		);
		hostCtl.reanchor('/w/' + FILE, hostEditor.text());
		hostCtl.suggestions.textChanged('/w/' + FILE, hostEditor.text());
	}
	if (o.hostOpens !== false) openOnHost();

	const hostSide = {
		ctl: hostCtl,
		session: host.session,
		doc: host.doc,
		buffers,
		writes,
		text: () => textOf(host.doc, FILE).toString(),
		get editor() {
			if (!hostEditor) throw new Error('the host has no editor open');
			return hostEditor;
		},
		get keys() {
			return keyboard(this.editor);
		},
		async mode(next: EditMode) {
			const was = hostMode;
			hostMode = next;
			host.session.setSuggesting(next === 'suggesting');
			if (next !== was) await hostCtl.suggestions.settle(was);
		},
		open() {
			if (!hostEditor) openOnHost();
		},
		close() {
			hostEditor?.destroy();
			hostEditor = null;
			hostText = '';
			hostCtl.reanchor(null, '');
		},
		/** drop off the relay and come back, the way a laptop lid does */
		away: () => host.transport.drop(),
		back: () => host.transport.start()
	};

	const guests: Awaited<ReturnType<typeof connectGuest>>[] = [];
	function forget(side: object): void {
		guests.splice((guests as object[]).indexOf(side), 1);
	}

	/** `author`: the name in the guest's Preferences, when it is not the one they joined under */
	async function join(name: string, o: { author?: string } = {}) {
		const side = await connectGuest(name, o);
		guests.push(side);
		return side;
	}

	async function connectGuest(name: string, o: { author?: string }) {
		let mode: EditMode = 'editing';
		const g = party('guest', name, {});
		// as workspaceComments advertises it
		g.session.setAuthor(o.author ?? name);
		const ytext = textOf(g.doc, FILE);
		await until(() => ytext.toString() === hostSide.text(), 10000, `${name} catching up`);
		const ctl = new CommentsController({
			root: () => 'session',
			preferredAuthor: () => o.author ?? name,
			openFileAt: () => {},
			activeText: () => editor.text(),
			mode: () => mode,
			compares: () => false,
			applyEdit: async (e) => {
				editor.change(e.from, e.to, e.insert);
				return true;
			},
			saveNow: () => {}
		});
		const editor = sharedEditor(ytext, g.session.awareness, (text) =>
			queueMicrotask(() => ctl.suggestions.textChanged('session/' + FILE, text))
		);
		cleanups.push(() => editor.destroy());
		// as workspaceComments wires it
		let running = ytext.toString();
		ytext.observe((ev) => {
			const before = running;
			running = ytext.toString();
			const who = g.session.senderOf(ev.transaction.origin);
			if (who === null || before === running || ctl.activeFile !== FILE) return;
			ctl.remoteEdit(FILE, before, running, { ...g.session.authorOf(who), gestures: changedSpans(ev.delta, before, running) });
		});
		await ctl.load(null);
		ctl.reanchor('session/' + FILE, editor.text());
		cleanups.push(shareComments(ctl, commentLogOf(g.doc), 'guest'));
		await until(() => ctl.threads.length === hostCtl.threads.length, 10000, `${name} getting the log`);
		const side = {
			name,
			ctl,
			session: g.session,
			doc: g.doc,
			editor,
			keys: keyboard(editor),
			/** each key reaching the host and settling there before the next */
			slowKeys: keysFor(editor.text, async (keys) => {
				for (const [from, to, insert] of keys) {
					editor.change(from, to, insert);
					await quiet();
				}
			}),
			/** each key folded into the shared text the way the visual editor writes, as guestSession.edit does */
			visualKeys: keysFor(editor.text, (keys) => {
				for (const [from, to, insert] of keys) {
					const now = ytext.toString();
					const diff = spliceDiff(now, now.slice(0, from) + insert + now.slice(to));
					if (!diff) continue;
					g.doc.transact(() => {
						if (diff.remove > 0) ytext.delete(diff.index, diff.remove);
						if (diff.insert) ytext.insert(diff.index, diff.insert);
					}, EDIT_ORIGIN);
				}
			}),
			text: () => editor.text(),
			hostRecords: () => [...g.session.peers.values()].some((p) => p.role === 'host' && p.suggesting !== undefined),
			async mode(next: EditMode) {
				const was = mode;
				mode = next;
				g.session.setSuggesting(next === 'suggesting');
				await until(
					() => host.session.peers.get(g.doc.clientID)?.suggesting === (next === 'suggesting'),
					10000,
					`${name}'s mode reaching the host`
				);
				if (next !== was) await ctl.suggestions.settle(was);
			},
			away: () => g.transport.drop(),
			back: () => g.transport.start(),
			leave(): void {
				g.session.destroy();
				forget(side);
			}
		};
		return side;
	}

	/** everyone holds the same text, every comparison has run, and every event has arrived */
	async function quiet(): Promise<void> {
		for (let round = 0; round < 3; round++) {
			await until(() => guests.every((g) => g.text() === hostSide.text()), 10000, 'every copy agreeing');
			await tick(20);
			await hostCtl.suggestions.settle();
			for (const g of guests) await g.ctl.suggestions.settle();
			await buffers.flushAll();
			await tick(20);
		}
		// on a busy machine the host's last events can still be on the wire; agree() says what never arrives
		const drawn = (ctl: CommentsController) => JSON.stringify(shape(ctl));
		await until(() => guests.every((g) => drawn(g.ctl) === drawn(hostCtl)), 5000).catch(() => {});
	}

	return {
		host: hostSide,
		join,
		guests,
		quiet,
		close() {
			for (const c of cleanups.reverse()) c();
		}
	};
}

export type Session = Awaited<ReturnType<typeof startSession>>;
export type Guest = Awaited<ReturnType<Session['join']>>;

const shape = (ctl: CommentsController) =>
	(placedOn(ctl)?.placed ?? []).map((p) => ({ id: p.id, from: p.from, to: p.to, restore: p.restore, author: p.author }));

/** once everything has settled: every guest draws what the host recorded, nothing is lost, and rejecting it all gives `base` */
export async function agree(s: Session, base: string): Promise<void> {
	await s.quiet();
	const host = placedOn(s.host.ctl);
	const text = s.host.text();
	expect(host?.text ?? text).toBe(text);
	expect([...s.host.ctl.orphaned]).toEqual([]);
	const recorded = s.host.ctl.threads.filter((t) => t.restore !== undefined && !t.resolved && t.file === FILE).map((t) => t.id);
	expect(
		shape(s.host.ctl)
			.map((p) => p.id)
			.sort()
	).toEqual(recorded.sort());
	for (const g of s.guests) {
		expect(g.text()).toBe(text);
		expect(shape(g.ctl), `${g.name} draws what the host recorded`).toEqual(shape(s.host.ctl));
	}
	expect(withAllRejected(text, host?.placed ?? [])).toBe(base);
	expect(disk[FILE]).toBe(text);
}

export async function rejectAllOn(ctl: CommentsController, s: Session): Promise<void> {
	for (let n = 0; n < 50; n++) {
		await s.quiet();
		const t = ctl.threads.find((x) => x.restore !== undefined && !x.resolved);
		if (!t) return;
		expect(await ctl.suggestions.reject(t), `rejecting ${JSON.stringify(t.anchor.quote)}`).toBe(true);
	}
	throw new Error('suggestions kept coming back');
}

export async function acceptAllOn(ctl: CommentsController, s: Session): Promise<void> {
	for (let n = 0; n < 50; n++) {
		await s.quiet();
		const t = ctl.threads.find((x) => x.restore !== undefined && !x.resolved);
		if (!t) return;
		await ctl.suggestions.accept(t);
	}
	throw new Error('suggestions kept coming back');
}
