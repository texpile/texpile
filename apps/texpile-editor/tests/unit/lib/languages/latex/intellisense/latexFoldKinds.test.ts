import { describe, expect, it } from 'vitest';
import type { EditorState } from '@codemirror/state';
import { foldService } from '@codemirror/language';
import { foldKinds, foldsOnOpen } from '$lib/editor/source/extensions/fold-kinds/foldKinds';
import { foldRangeAt } from '$lib/languages/latex/intellisense/fold';
import { latexFoldKinds } from '$lib/languages/latex/intellisense/latexFoldKinds';
import { latexState } from '../latexState';

const PAPER = [
	'\\section{Intro}',
	'Text.',
	'\\begin{figure}',
	'\\begin{tabular}{cc}',
	'a & b',
	'\\end{tabular}',
	'\\end{figure}',
	'\\begin{wrapfigure}{r}{0.4\\textwidth}',
	'Wrapped.',
	'\\end{wrapfigure}',
	'\\begin{equation}',
	'x = 1',
	'\\end{equation}',
	'\\[',
	'y = 2',
	'\\]',
	'\\begin{itemize}',
	'\\item one',
	'\\end{itemize}'
].join('\n');

const firstLines = (state: EditorState, ranges: { from: number }[]) => ranges.map((r) => state.doc.lineAt(r.from).text);

describe('LaTeX folds by kind', () => {
	it('sorts floats and tabulars, display math and other environments, and folds what each slider stop names', () => {
		const state = latexState(PAPER, { extensions: [foldService.of(foldRangeAt), foldKinds.of(latexFoldKinds)] });
		expect(latexFoldKinds(state).map((f) => `${state.doc.lineAt(f.from).text} ${f.kind}`)).toEqual([
			'\\begin{figure} float',
			'\\begin{tabular}{cc} float',
			'\\begin{wrapfigure}{r}{0.4\\textwidth} float',
			'\\begin{equation} equation',
			'\\[ equation',
			'\\begin{itemize} environment'
		]);
		expect(firstLines(state, foldsOnOpen(state, 'floats'))).toEqual(['\\begin{figure}', '\\begin{wrapfigure}{r}{0.4\\textwidth}']);
		expect(firstLines(state, foldsOnOpen(state, 'equations'))).toEqual([
			'\\begin{figure}',
			'\\begin{wrapfigure}{r}{0.4\\textwidth}',
			'\\begin{equation}',
			'\\['
		]);
		expect(firstLines(state, foldsOnOpen(state, 'environments'))).toEqual([
			'\\begin{figure}',
			'\\begin{wrapfigure}{r}{0.4\\textwidth}',
			'\\begin{equation}',
			'\\[',
			'\\begin{itemize}'
		]);
		expect(firstLines(state, foldsOnOpen(state, 'everything'))).toEqual(['\\section{Intro}']);
	});
});
