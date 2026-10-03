// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding, foldable, foldedRanges, foldEffect, foldService } from '@codemirror/language';
import { foldRangeAt } from '$lib/languages/latex/intellisense/fold';
import { docPositions } from '$lib/workspace/docPositions';
import { foldMemory } from '$lib/editor/source/extensions/fold-memory/foldMemory';

const ROOT = 'C:/papers/thesis';
const FILE = `${ROOT}/main.tex`;
const PAPER = '\\section{Intro}\nText.\n\\section{Method}\nSteps.\nMore.\n\\section{End}\nBye.';

function open(doc: string): EditorView {
	return new EditorView({
		state: EditorState.create({ doc, extensions: [foldService.of(foldRangeAt), codeFolding(), foldMemory(FILE)] }),
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
});
