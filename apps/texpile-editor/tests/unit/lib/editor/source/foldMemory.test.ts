// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding, foldable, foldedRanges, foldEffect, foldService, unfoldEffect } from '@codemirror/language';
import { foldRangeAt } from '$lib/languages/latex/intellisense/fold';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { docPositions } from '$lib/workspace/docPositions';
import { foldMemory } from '$lib/editor/source/extensions/fold-memory/foldMemory';
import { foldKinds } from '$lib/editor/source/extensions/fold-kinds/foldKinds';
import { latexFoldKinds } from '$lib/languages/latex/intellisense/latexFoldKinds';
import { settings } from '$lib/settings';

const ROOT = 'C:/papers/thesis';
const FILE = `${ROOT}/main.tex`;
const PAPER = '\\section{Intro}\nText.\n\\section{Method}\nSteps.\nMore.\n\\section{End}\nBye.';

function open(doc: string): EditorView {
	return new EditorView({
		state: EditorState.create({
			doc,
			extensions: [latex(), foldService.of(foldRangeAt), foldKinds.of(latexFoldKinds), codeFolding(), foldMemory(FILE)]
		}),
		parent: document.body
	});
}

function foldedLines(view: EditorView): string[] {
	const out: string[] = [];
	foldedRanges(view.state).between(0, view.state.doc.length, (from) => void out.push(view.state.doc.lineAt(from).text));
	return out;
}

describe('source fold memory', () => {
	beforeEach(() => {
		localStorage.clear();
		docPositions.bind(ROOT, true);
	});

	// destroyed before any frame: a live view measures in rAF, which throws in a layout-less jsdom
	it('folds the same section again after lines were added above it on disk', async () => {
		const first = open(PAPER);
		const method = first.state.doc.line(3);
		first.dispatch({ effects: foldEffect.of(foldable(first.state, method.from, method.to)!) });
		first.destroy();

		const second = open('% a note added elsewhere\n\n' + PAPER);
		await Promise.resolve();
		expect(foldedLines(second)).toEqual(['\\section{Method}']);
		second.destroy();
	});

	// closing the window tears nothing down, and the next start folded another line that read the same
	it('forgets a fold the reader deleted, with the editor still open', () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const view = open(PAPER);
			const method = view.state.doc.line(3);
			view.dispatch({ effects: foldEffect.of(foldable(view.state, method.from, method.to)!) });
			expect(docPositions.get(FILE)?.folds).toHaveLength(1);
			view.dispatch({ changes: { from: method.from, to: view.state.doc.line(5).to + 1 }, userEvent: 'delete' });
			expect(foldedLines(view)).toEqual([]);
			vi.advanceTimersByTime(1000);
			expect(docPositions.get(FILE)?.folds).toEqual([]);
			view.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it('folds what the setting names in a file never folded, and opens one the reader unfolded as they left it', async () => {
		const before = settings.current;
		settings.current = { ...before, foldOnOpen: 'equations' };
		try {
			const doc = 'Text.\n\\begin{equation}\nx = 1\n\\end{equation}\nMore.';
			const first = open(doc);
			await Promise.resolve();
			expect(foldedLines(first)).toEqual(['\\begin{equation}']);
			foldedRanges(first.state).between(0, first.state.doc.length, (from, to) => {
				first.dispatch({ effects: unfoldEffect.of({ from, to }) });
			});
			first.destroy();

			const second = open(doc);
			await Promise.resolve();
			expect(foldedLines(second)).toEqual([]);
			second.destroy();
		} finally {
			settings.current = before;
		}
	});
});
