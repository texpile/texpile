// @vitest-environment jsdom
// the source editor wired to the controller the way the workspace wires them, undoing what was suggested
import { it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	deleteCharBackward,
	deleteCharForward,
	deleteGroupBackward,
	deleteGroupForward,
	history,
	isolateHistory,
	redo,
	undo,
	undoDepth
} from '@codemirror/commands';
import { activeSuggestions, editMode } from '$lib/comments/activeSuggestions.svelte';
import { cmSuggestions, fitsSuggestion, liveSuggestionRanges, setSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import type { PlacedSuggestion } from '$lib/comments/suggestCompare';

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async () => {
		throw new Error('ENOENT');
	},
	writeTextFile: async () => {},
	joinPath: (a: string, b: string) => `${a}/${b}`
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/comments/author', () => ({ resolveAuthor: async () => 'me', forgetAuthor: () => {} }));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');

// jsdom lays nothing out, and CodeMirror measures text after the commands scroll
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const ROOT = '/w';
const FILE = `${ROOT}/main.tex`;
const RUNS = Number(process.env.SUGGEST_FUZZ_RUNS ?? 40);
const PIECES = ['a', 'b', 'x', 'the', ' ', ' ', '\n', '{', '}', '$', '😀', 'é', '中'];
const DOC = 'The quick brown fox jumps over the lazy dog.\nSecond line here, with $x^2$.\n\nThird 😀 line ends.';

function prng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

async function sourceEditor() {
	activeSuggestions.current = [];
	editMode.current = 'suggesting';
	const ref: { view?: EditorView } = {};
	const ctl = new CommentsController({
		root: () => ROOT,
		preferredAuthor: () => 'me',
		openFileAt: () => {},
		activeText: () => ref.view!.state.doc.toString(),
		mode: () => 'suggesting'
	});
	let drawn: unknown = null;
	const draw = () => {
		const marks = activeSuggestions.current;
		if (marks === drawn || !marks.every((r) => fitsSuggestion(view.state, r))) return;
		drawn = marks;
		view.dispatch({ effects: setSuggestionRanges.of(marks.map(({ id, from, to, restore, mine }) => ({ id, from, to, restore, mine }))) });
	};
	const view = new EditorView({
		parent: document.body,
		state: EditorState.create({
			doc: DOC,
			extensions: [
				cmSuggestions(),
				history(),
				EditorView.updateListener.of((u) => {
					if (u.docChanged) ctl.suggestions.textChanged(FILE, u.state.doc.toString());
				})
			]
		})
	});
	ref.view = view;
	await ctl.load(ROOT);
	ctl.reanchor(FILE, DOC);
	ctl.suggestions.textChanged(FILE, DOC);
	const placed = () =>
		(ctl.suggestions as unknown as { states: Map<string, { placed: PlacedSuggestion[] }> }).states.get('main.tex')?.placed ?? [];
	return {
		view,
		placed,
		async settle() {
			await ctl.suggestions.settle();
			await new Promise((r) => setTimeout(r, 0));
			await ctl.suggestions.settle();
			draw();
		}
	};
}

function rejected(text: string, placed: PlacedSuggestion[]): string {
	let out = text;
	for (const s of [...placed].sort((a, b) => a.from - b.from || a.to - b.to).reverse())
		out = out.slice(0, s.from) + s.restore + out.slice(s.to);
	return out;
}

it('undoing everything suggested in the source editor leaves the file as it was and nothing suggested', async () => {
	const failures: string[] = [];
	for (let run = 1; run <= RUNS && failures.length < 3; run++) {
		const rnd = prng(run * 7919);
		const e = await sourceEditor();
		const { view } = e;
		const log: string[] = [];
		const at = () => {
			const t = view.state.doc.toString();
			const p = Math.floor(rnd() * (t.length + 1));
			return /[\uDC00-\uDFFF]/.test(t[p] ?? '') ? p - 1 : p;
		};
		const type = (w: string) => {
			for (const ch of w) view.dispatch(view.state.replaceSelection(ch), { userEvent: 'input.type' });
		};
		const steps = 3 + Math.floor(rnd() * 14);
		for (let i = 0; i < steps; i++) {
			const op = rnd();
			const p = at();
			const piece = () => PIECES[Math.floor(rnd() * PIECES.length)];
			if (op < 0.25) {
				const q = rnd() < 0.7 ? p : Math.min(view.state.doc.length, p + Math.floor(rnd() * 8));
				const t = view.state.doc.toString();
				view.dispatch({ selection: { anchor: p, head: /[\uDC00-\uDFFF]/.test(t[q] ?? '') ? q + 1 : q } });
				const w = piece() + (rnd() < 0.5 ? piece() : '');
				type(w);
				log.push(`type ${JSON.stringify(w)} @${p}-${q}`);
			} else if (op < 0.5) {
				view.dispatch({ selection: { anchor: p } });
				const n = 1 + Math.floor(rnd() * 3);
				for (let k = 0; k < n; k++) (op < 0.4 ? deleteCharBackward : deleteCharForward)(view);
				log.push(`${op < 0.4 ? 'backspace' : 'delete'} x${n} @${p}`);
			} else if (op < 0.62) {
				view.dispatch({ selection: { anchor: p } });
				(op < 0.56 ? deleteGroupBackward : deleteGroupForward)(view);
				log.push(`${op < 0.56 ? 'word backspace' : 'word delete'} @${p}`);
			} else if (op < 0.72) {
				undo(view);
				log.push('undo');
			} else if (op < 0.78) {
				redo(view);
				log.push('redo');
			} else if (op < 0.84) {
				view.dispatch({ selection: { anchor: p } });
				type('\n');
				log.push(`enter @${p}`);
			} else if (op < 0.9) {
				const w = piece();
				type(w);
				log.push(`type here ${JSON.stringify(w)}`);
			} else {
				view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: rnd() < 0.5 ? 'ArrowLeft' : 'ArrowRight', bubbles: true }));
				log.push('arrow');
			}
			if (rnd() < 0.85) await e.settle();
			if (rnd() < 0.3) view.dispatch({ annotations: isolateHistory.of('full') });
			await e.settle();
		}
		const fail = (why: string) => failures.push(`run ${run}: ${why}\n  ${log.join(' | ')}`);
		const text = view.state.doc.toString();
		if (rejected(text, e.placed()) !== DOC) fail('rejecting everything does not give the file back');
		for (let k = 0; k < 60 && undoDepth(view.state) > 0; k++) {
			undo(view);
			await e.settle();
		}
		if (view.state.doc.toString() !== DOC) fail('undo did not give the file back');
		else if (e.placed().length) fail(`undo left ${JSON.stringify(e.placed().map((s) => [DOC.slice(s.from, s.to), s.restore]))}`);
		else if (liveSuggestionRanges(view.state).length) fail('undo left suggestions drawn');
		view.destroy();
	}
	expect(failures).toEqual([]);
}, 600_000);
