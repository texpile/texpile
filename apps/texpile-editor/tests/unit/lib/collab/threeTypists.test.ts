// @vitest-environment jsdom
// three windows type into one paragraph at once, each a visual editor over its own copy of the shared doc,
// with updates crossing a relay late and out of order; patches land between keystrokes as they do under load
import { it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { LocalFork } from '$lib/collab/localFork';
import { EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { applyRemotePatch } from '$lib/collab/remotePatch';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';

const SOURCE = '\\section{Intro}\nDelta intro text lives in its own file.\n\nEcho second intro paragraph.\n';
const TYPISTS = [
	['Delta intro', ' HHH alpha beta gamma'],
	['lives in its', ' WWW one two three'],
	['own file', ' SSS uno dos tres']
];
const RELAY = Symbol('relay');

const views: EditorView[] = [];
afterEach(() => {
	for (const v of views.splice(0)) v.destroy();
	vi.useRealTimers();
});

function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

// a window wired as VisualCollab wires it: a collaborator's change is parsed once typing pauses and patched in
function openWindow(update: Uint8Array, parseMs: number) {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, update);
	const text = doc.getText('f');
	const fork = new LocalFork(doc);
	let timer: ReturnType<typeof setTimeout> | null = null;
	const buffer = new DocumentBuffer({
		textModel: () => ({ text, write: (content, before) => fork.fold(text, content, before, EDIT_ORIGIN) }),
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => schedule(800),
		clearPendingAnchor: () => {}
	});
	buffer.openTex('C:/ws/sections/intro.tex', SOURCE, '\n');
	const parsed = parseLatexFile(SOURCE);
	buffer.adoptParsed(parsed, SOURCE);
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: parsed.doc, plugins: [parseCarryPlugin] }),
		dispatchTransaction(this: EditorView, tr: Transaction) {
			this.updateState(this.state.apply(tr));
			if (tr.docChanged && !tr.getMeta('collabRemotePatch')) buffer.onVisualChange(this.state.doc);
		}
	});
	views.push(view);
	function schedule(delay = 60) {
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			void patch();
		}, delay);
	}
	async function patch() {
		const snapshot = text.toString();
		await new Promise((r) => setTimeout(r, parseMs));
		if (text.toString() !== snapshot) return schedule();
		const next = parseLatexFile(snapshot);
		applyRemotePatch(view, next.doc, buffer.sourceMap, next.map, next.origins, buffer.texSource, snapshot);
		buffer.adoptPatched(next, view.state.doc, snapshot);
	}
	text.observe((ev) => {
		if (ev.transaction.origin !== EDIT_ORIGIN) schedule();
	});
	return { doc, text, view };
}

it.each([1, 2, 3, 4, 5, 6])('three typists in one paragraph keep every word in place (seed %i)', async (seed) => {
	vi.useFakeTimers();
	const random = seeded(seed);
	const base = new Y.Doc();
	base.getText('f').insert(0, SOURCE);
	const windows = TYPISTS.map(() => openWindow(Y.encodeStateAsUpdate(base), 5 + Math.floor(random() * 20)));
	for (const from of windows)
		from.doc.on('update', (u: Uint8Array, origin: unknown) => {
			if (origin === RELAY) return;
			for (const to of windows) if (to !== from) setTimeout(() => Y.applyUpdate(to.doc, u, RELAY), Math.floor(random() * 40));
		});
	TYPISTS.forEach(([after], i) => {
		const { view } = windows[i];
		let at = -1;
		view.state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text!.includes(after)) at = pos + n.text!.indexOf(after) + after.length;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	});
	for (let k = 0; k < 21; k++) {
		TYPISTS.forEach(([, words], i) => {
			const { view } = windows[i];
			if (k < words.length) setTimeout(() => view.dispatch(view.state.tr.insertText(words[k])), Math.floor(random() * 10));
		});
		await vi.advanceTimersByTimeAsync(120);
	}
	await vi.advanceTimersByTimeAsync(5000);
	let want = SOURCE;
	for (const [after, words] of TYPISTS) want = want.replace(after, after + words);
	const texts = windows.map((w) => w.text.toString());
	expect(texts[1]).toBe(texts[0]);
	expect(texts[2]).toBe(texts[0]);
	expect(texts[0]).toBe(want);
});
