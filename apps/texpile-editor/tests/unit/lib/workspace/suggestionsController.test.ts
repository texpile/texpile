// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { buildAnchor } from '$lib/comments/anchor';
import { openEvent, parseLog, serializeLog } from '$lib/comments/log';
import { activeSuggestions, noteEditedPlaces } from '$lib/comments/activeSuggestions.svelte';
import type { TextChange } from '$lib/comments/editGestures';

let disk: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (path: string, text: string) => {
		disk['.texpile/comments.jsonl'] = text;
	},
	joinPath: (a: string, b: string) => `${a}/${b}`
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
let who = 'louis';
let authorCalls = 0;
vi.mock('$lib/comments/author', () => ({
	resolveAuthor: async () => {
		authorCalls++;
		return who;
	},
	forgetAuthor: () => {}
}));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');
const { commentLogOf, shareComments } = await import('$lib/collab/sharedComments');

/** two copies of a shared doc that pass every change straight to each other, as a session does */
function linkedDocs(): [Y.Doc, Y.Doc] {
	const a = new Y.Doc();
	const b = new Y.Doc();
	a.on('update', (u: Uint8Array, origin: unknown) => origin !== b && Y.applyUpdate(b, u, a));
	b.on('update', (u: Uint8Array, origin: unknown) => origin !== a && Y.applyUpdate(a, u, b));
	return [a, b];
}

const ROOT = '/w';
const FILE = `${ROOT}/main.tex`;
const TEXT = 'We prove the estimator is sharp for smooth solutions.\n';

function suggestion(id: string, text: string, words: string, restore: string, at = text.indexOf(words)) {
	return openEvent({ id, file: 'main.tex', anchor: buildAnchor(text, at, at + words.length), body: '', by: 'mei', at: 'now', restore });
}

function make(initial: string, mode: 'editing' | 'suggesting' = 'editing', name = 'main.tex') {
	let text = initial;
	let visual = false;
	const edits: { from: number; to: number; insert: string }[] = [];
	const marks: number[] = [];
	const ctl = new CommentsController({
		root: () => ROOT,
		preferredAuthor: () => 'louis',
		openFileAt: () => {},
		activeText: () => text,
		mode: () => mode,
		rewraps: () => visual,
		applyEdit: async (e) => {
			edits.push(e);
			text = text.slice(0, e.from) + e.insert + text.slice(e.to);
			return true;
		},
		markDecision: (seq) => marks.push(seq),
		saveNow: () => {}
	});
	const open = async () => {
		await ctl.load(ROOT);
		ctl.reanchor(`${ROOT}/${name}`, text);
	};
	return {
		ctl,
		edits,
		marks,
		open,
		type: (next: string) => (text = next),
		text: () => text,
		setMode: (next: typeof mode) => (mode = next),
		setVisual: (next: boolean) => (visual = next)
	};
}

const logged = () => parseLog(disk['.texpile/comments.jsonl'] ?? '');

describe('a suggestion in the file', () => {
	beforeEach(() => {
		disk = {};
		activeSuggestions.current = [];
	});

	it('keeps a Delete and an Add across a reopen, and places both', async () => {
		const at = TEXT.indexOf('sharp');
		disk['.texpile/comments.jsonl'] = serializeLog([suggestion('add', TEXT, 'sharp ', ''), suggestion('del', TEXT, '', 'very ', at)]);
		const { ctl, open } = make(TEXT);
		await open();
		expect(ctl.threads.map((t) => t.id).sort()).toEqual(['add', 'del']);
		expect(logged().some((e) => e.t === 'delete')).toBe(false);
		expect(ctl.orphaned.size).toBe(0);
		expect(activeSuggestions.current.map((s) => [s.id, s.from, s.to])).toEqual([
			['del', at, at],
			['add', at, at + 'sharp '.length]
		]);
	});

	it('puts the old words back only where the new words still are', async () => {
		disk['.texpile/comments.jsonl'] = serializeLog([suggestion('s1', TEXT, 'sharp', 'reliable')]);
		const { ctl, edits, open, text } = make(TEXT);
		await open();
		expect(await ctl.suggestions.reject(ctl.threads[0])).toBe(true);
		expect(text()).toBe('We prove the estimator is reliable for smooth solutions.\n');
		expect(logged().find((e) => e.t === 'resolve')).toMatchObject({ thread: 's1', decision: 'rejected' });

		const moved = make('We prove the estimator is blunt for smooth solutions.\n');
		disk['.texpile/comments.jsonl'] = serializeLog([suggestion('s2', TEXT, 'sharp', 'reliable')]);
		await moved.open();
		expect(moved.ctl.orphaned.has('s2')).toBe(true);
		expect(await moved.ctl.suggestions.reject(moved.ctl.threads[0])).toBe(false);
		expect(moved.edits).toEqual([]);
		expect(edits).toHaveLength(1);
	});

	// Suggesting: the words coming back would otherwise be a new suggestion of the reader's own
	it.each(['editing', 'suggesting'] as const)('brings rejected suggestions back as the Rejects are undone in %s', async (mode) => {
		disk['.texpile/comments.jsonl'] = serializeLog([
			suggestion('s1', TEXT, 'sharp', 'reliable'),
			suggestion('s2', TEXT, 'smooth', 'regular')
		]);
		const { ctl, open, type, text } = make(TEXT, mode);
		await open();
		const thread = (id: string) => ctl.threads.find((t) => t.id === id)!;
		const opened = () => ctl.threads.filter((t) => !t.resolved).map((t) => t.id);
		async function goTo(next: string) {
			type(next);
			ctl.suggestions.textChanged(FILE, next);
			await ctl.suggestions.settle();
		}
		expect(await ctl.suggestions.reject(thread('s1'))).toBe(true);
		const oneRejected = text();
		expect(await ctl.suggestions.reject(thread('s2'))).toBe(true);
		const bothRejected = text();

		await goTo(oneRejected);
		expect(opened()).toEqual(['s2']);
		await goTo(TEXT);
		expect(opened()).toEqual(['s1', 's2']);
		expect(activeSuggestions.current.map((s) => [s.id, TEXT.slice(s.from, s.to), s.restore])).toEqual([
			['s1', 'sharp', 'reliable'],
			['s2', 'smooth', 'regular']
		]);
		await ctl.suggestions.beforeSave('main.tex', TEXT);
		expect(
			logged()
				.filter((e) => e.t === 'resolve')
				.slice(-2)
		).toMatchObject([
			{ thread: 's2', resolved: false },
			{ thread: 's1', resolved: false }
		]);

		// and a redo rejects them again
		await goTo(oneRejected);
		await goTo(bothRejected);
		expect(opened()).toEqual([]);
		expect(thread('s1').decision).toBe('rejected');
		expect(activeSuggestions.current).toEqual([]);
	});

	// Docs does the same: an Accept is one step of the undo history like any edit
	it('brings an accepted suggestion back where it stood when the Accept is undone, and accepts it on redo', async () => {
		disk['.texpile/comments.jsonl'] = serializeLog([suggestion('s1', TEXT, 'sharp', 'reliable')]);
		const { ctl, open, marks } = make(TEXT);
		await open();
		const thread = () => ctl.threads.find((t) => t.id === 's1')!;
		await ctl.suggestions.accept(thread());
		expect(thread().decision).toBe('accepted');
		expect(activeSuggestions.current).toEqual([]);
		expect(marks).toEqual([1]);

		await ctl.suggestions.revisitAccept(1, true);
		expect(thread().resolved).toBe(false);
		expect(activeSuggestions.current.map((s) => [s.id, TEXT.slice(s.from, s.to), s.restore])).toEqual([['s1', 'sharp', 'reliable']]);

		await ctl.suggestions.revisitAccept(1, false);
		expect(thread().decision).toBe('accepted');
		expect(activeSuggestions.current).toEqual([]);
		expect(logged().filter((e) => e.t === 'resolve')).toMatchObject([
			{ thread: 's1', resolved: true, decision: 'accepted' },
			{ thread: 's1', resolved: false },
			{ thread: 's1', resolved: true, decision: 'accepted' }
		]);
	});

	it('keeps what was typed when the folder changes, and drops it when the edit is thrown away', async () => {
		const after = TEXT.replace('sharp', 'tight');
		const kept = make(TEXT, 'suggesting');
		await kept.open();
		kept.type(after);
		kept.ctl.suggestions.textChanged(FILE, after);
		const settling = kept.ctl.suggestions.settle();
		kept.ctl.reanchor(FILE, after);
		await settling;
		await kept.ctl.load('/elsewhere');
		expect(logged().find((e) => e.t === 'open')).toMatchObject({ restore: 'sharp', anchor: { quote: 'tight' } });

		disk = {};
		const thrown = make(TEXT, 'suggesting');
		await thrown.open();
		thrown.type(after);
		thrown.ctl.suggestions.textChanged(FILE, after);
		await thrown.ctl.suggestions.settle();
		thrown.ctl.suggestions.discardUnsaved('main.tex');
		await thrown.ctl.store.append();
		expect(logged().some((e) => e.t === 'open' && e.restore !== undefined)).toBe(false);
	});

	it('shows what is typed while suggesting as soon as typing starts', async () => {
		const { ctl, open, type } = make(TEXT, 'suggesting');
		await open();
		const after = TEXT.replace('sharp', 'tight');
		type(after);
		ctl.suggestions.textChanged(FILE, after);
		await new Promise((r) => setTimeout(r, 20));
		expect(activeSuggestions.current.map((s) => [after.slice(s.from, s.to), s.restore])).toEqual([['tight', 'sharp']]);
	});

	// resolving it spawns git, and the first comparison awaits it: anything deleted while that runs is
	// already gone from the file with nothing drawn where it was
	it('knows who is suggesting before the first comparison needs it', async () => {
		const before = authorCalls;
		const { open } = make(TEXT, 'suggesting');
		await open();
		await new Promise((r) => setTimeout(r, 0));
		expect(authorCalls).toBeGreaterThan(before);
	});

	// Editing: the Delete was made while suggesting, and the mode switched before the undo
	it.each(['suggesting', 'editing'] as const)('takes a Delete away again when the words are put back in %s', async (backIn) => {
		const { ctl, open, type, setMode } = make(TEXT, 'suggesting');
		await open();
		const cut = TEXT.replace('sharp ', '');
		type(cut);
		ctl.suggestions.textChanged(FILE, cut);
		await ctl.suggestions.settle();
		expect(activeSuggestions.current.map((s) => s.restore)).toEqual(['sharp ']);
		setMode(backIn);
		// an undo, or the same thing typed back by hand
		type(TEXT);
		ctl.suggestions.textChanged(FILE, TEXT);
		await ctl.suggestions.settle();
		expect(activeSuggestions.current).toEqual([]);
	});

	// as the source editor reports a key typed with two cursors, with no comparison run between the keys
	it('makes one suggestion for each place an edit with several cursors changed', async () => {
		const start = 'The colour map is wide.\nA colour bar sits under it.\n';
		const { ctl, open, type } = make(start, 'suggesting');
		await open();
		ctl.suggestions.textChanged(FILE, start);
		let now = start;
		let spots = [...start.matchAll(/colour/g)].map((m) => ({ from: m.index!, to: m.index! + 'colour'.length }));
		for (const key of 'hue') {
			let next = '';
			let at = 0;
			let delta = 0;
			const changes: TextChange[] = [];
			for (const s of spots) {
				next += now.slice(at, s.from) + key;
				at = s.to;
				changes.push({ fromA: s.from, toA: s.to, fromB: s.from + delta, toB: s.from + delta + 1 });
				delta += 1 - (s.to - s.from);
			}
			next += now.slice(at);
			noteEditedPlaces({ before: now, after: next, changes });
			now = next;
			type(now);
			ctl.suggestions.textChanged(FILE, now);
			spots = changes.map((c) => ({ from: c.toB, to: c.toB }));
		}
		await ctl.suggestions.beforeSave('main.tex', now);
		expect(logged().flatMap((e) => (e.t === 'open' ? [[e.anchor.quote, e.restore]] : []))).toEqual([
			['hue', 'colour'],
			['hue', 'colour']
		]);
	});

	it('makes one suggestion of each phrase typed a key at a time, and rejecting them gives the text back', async () => {
		const start = 'Away from a shock a coarse grid resolves the flow.\n';
		const { ctl, open, type, text } = make(start, 'suggesting');
		await open();
		let now = start;
		async function keys(at: number, typed: string, over = 0) {
			for (let i = 0; i < typed.length; i++) {
				now = now.slice(0, at + i) + typed[i] + now.slice(at + i + (i === 0 ? over : 0));
				type(now);
				ctl.suggestions.textChanged(FILE, now);
				await new Promise((r) => setTimeout(r, 5));
			}
		}
		await keys(start.indexOf('a coarse grid'), 'one fine mesh', 'a coarse grid'.length);
		await keys(now.indexOf(' the flow'), ' all of');
		await ctl.suggestions.beforeSave('main.tex', now);
		expect(logged().flatMap((e) => (e.t === 'open' ? [[e.anchor.quote, e.restore]] : []))).toEqual([
			['one fine mesh', 'a coarse grid'],
			[' all of', '']
		]);
		for (const t of ctl.threads.filter((x) => !x.resolved)) expect(await ctl.suggestions.reject(t)).toBe(true);
		expect(text()).toBe(start);
	});

	// a .bib has no dialect of its own, so it anchors as LaTeX: braces and @ everywhere, and the
	// normalizer strips braces
	it('suggests in a .bib, and rejecting gives the entry back', async () => {
		const BIB = `@article{sharp2020,\n  title = {Shock capturing on coarse grids},\n  year = {2020}\n}\n`;
		const { ctl, open, type, text } = make(BIB, 'suggesting', 'refs.bib');
		await open();
		const after = BIB.replace('coarse', 'fine');
		type(after);
		await ctl.suggestions.beforeSave('refs.bib', after);
		expect(logged().flatMap((e) => (e.t === 'open' ? [[e.anchor.quote, e.restore]] : []))).toEqual([['fine', 'coarse']]);
		for (const t of ctl.threads.filter((x) => !x.resolved)) expect(await ctl.suggestions.reject(t)).toBe(true);
		expect(text()).toBe(BIB);
	});

	// one gesture should read as one card. A replacement whose first letter matches the word it
	// replaces leaves a point deletion plus an insertion at the same spot, which used to stay apart
	it('makes one suggestion of a replacement that starts with the same letter', async () => {
		const start = `A coarse grid resolves the flow.\n`;
		const { ctl, open, type, text } = make(start, 'suggesting');
		await open();
		let now = start;
		const at = start.indexOf('coarse');
		for (const [i, ch] of [...'crude'].entries()) {
			now = i === 0 ? start.slice(0, at) + ch + start.slice(at + 'coarse'.length) : now.slice(0, at + i) + ch + now.slice(at + i);
			type(now);
			ctl.suggestions.textChanged(FILE, now);
			await new Promise((r) => setTimeout(r, 5));
		}
		await ctl.suggestions.settle();
		expect(now).toBe(`A crude grid resolves the flow.\n`);
		// one card, and a replacement rather than a Delete beside an Add. The shared first letter is
		// left out of it on purpose: that letter did not change
		expect(activeSuggestions.current.map((s) => [s.restore, now.slice(s.from, s.to)])).toEqual([['oarse', 'rude']]);
		for (const t of ctl.threads.filter((x) => !x.resolved)) expect(await ctl.suggestions.reject(t)).toBe(true);
		expect(text()).toBe(start);
	});

	it('keeps two people’s Deletes at one spot in order across a reopen', async () => {
		const { ctl, open, type } = make(TEXT, 'suggesting');
		await open();
		const mine = TEXT.replace('estimator ', '');
		type(mine);
		await ctl.suggestions.beforeSave('main.tex', mine);
		who = 'mei';
		const both = mine.replace('the ', '');
		type(both);
		await ctl.suggestions.beforeSave('main.tex', both);
		who = 'louis';

		const reopened = make(both, 'suggesting');
		await reopened.open();
		for (const t of reopened.ctl.threads.filter((x) => !x.resolved)) expect(await reopened.ctl.suggestions.reject(t)).toBe(true);
		expect(reopened.text()).toBe(TEXT);
	});

	it('takes staged events peers saw back out of the session when they are thrown away', async () => {
		const [hostDoc, guestDoc] = linkedDocs();
		let text = TEXT;
		const ctl = new CommentsController({
			root: () => ROOT,
			preferredAuthor: () => 'louis',
			openFileAt: () => {},
			activeText: () => text,
			mode: () => 'suggesting',
			applyEdit: async () => false,
			saveNow: () => {}
		});
		const peer = new CommentsController({
			root: () => 'session',
			preferredAuthor: () => 'mei',
			openFileAt: () => {},
			compares: () => false
		});
		await ctl.load(ROOT);
		await peer.load(null);
		shareComments(ctl, commentLogOf(hostDoc), 'host');
		shareComments(peer, commentLogOf(guestDoc), 'guest');
		ctl.reanchor(FILE, text);
		ctl.suggestions.textChanged(FILE, text);
		text = TEXT.replace('sharp', 'tight');
		ctl.suggestions.textChanged(FILE, text);
		await ctl.suggestions.settle();
		expect(peer.threads.map((t) => t.restore)).toEqual(['sharp']);
		expect(ctl.store.serialize()).toBe('\n');
		ctl.suggestions.discardUnsaved('main.tex');
		expect(peer.threads).toEqual([]);
		expect(commentLogOf(hostDoc).length).toBe(0);
	});

	it('records an agent’s rewrite as one suggestion of its own while the reader is editing, and keeps the reader’s typing theirs', async () => {
		const start = 'Away from a shock a coarse grid resolves the flow well enough for now.\n';
		const { ctl, open, type, text } = make(start, 'editing');
		await open();
		const typed = start.replace('for now', 'for this test');
		type(typed);
		ctl.suggestions.textChanged(FILE, typed);
		const words = 'a coarse grid resolves the flow well enough';
		const from = typed.indexOf(words);
		const id = await ctl.suggestions.suggestAs('Claude', { from, to: from + words.length, insert: 'coarse grids resolve it' }, 'Shorten');
		await ctl.suggestions.beforeSave('main.tex', text());
		const opened = logged().filter((e) => e.t === 'open');
		expect(opened).toEqual([
			expect.objectContaining({
				id,
				by: 'Claude',
				body: 'Shorten',
				restore: words,
				anchor: expect.objectContaining({ quote: 'coarse grids resolve it' })
			})
		]);
		expect(await ctl.suggestions.reject(ctl.threads[0])).toBe(true);
		expect(text()).toBe(typed);
	});

	// spaces wait a second before they are compared, and a switch to the visual editor can land in that second
	it('compares spaces typed in the source editor by the source editor’s rule after a switch to visual', async () => {
		const { ctl, open, type, setVisual } = make(TEXT, 'suggesting');
		await open();
		const after = TEXT.replace('We prove ', 'We prove  ');
		type(after);
		ctl.suggestions.textChanged(FILE, after);
		setVisual(true);
		await ctl.suggestions.settle();
		expect(activeSuggestions.current.map((s) => [after.slice(s.from, s.to), s.restore])).toEqual([[' ', '']]);
	});

	it('writes what was typed while suggesting to the log before the file is saved', async () => {
		const { ctl, open, type } = make(TEXT, 'suggesting');
		await open();
		const after = TEXT.replace('sharp', 'tight');
		type(after);
		ctl.reanchor(FILE, after);
		await ctl.suggestions.beforeSave('main.tex', after);
		const opened = logged().find((e) => e.t === 'open');
		expect(opened).toMatchObject({ restore: 'sharp', anchor: { quote: 'tight' } });
	});
});
