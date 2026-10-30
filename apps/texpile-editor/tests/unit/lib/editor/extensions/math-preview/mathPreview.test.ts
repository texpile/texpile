import { describe, it, expect } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { showTooltip } from '@codemirror/view';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { latexLanguage } from '$lib/languages/latex/source/latexLanguage';
import { mathPreview } from '$lib/editor/source/extensions/math-preview/mathPreview';

function stateAt(doc: string, inside: string, markdown?: boolean): EditorState {
	return EditorState.create({
		doc,
		selection: { anchor: doc.indexOf(inside) + 1 },
		extensions: mathPreview(markdown === undefined ? {} : { markdown })
	});
}

function shows(state: EditorState): boolean {
	return state.facet(showTooltip).some(Boolean);
}

describe('the source math preview', () => {
	it('reads a percent sign in Markdown as text, not as the start of a comment', () => {
		expect(shows(stateAt('Up 50% since $x^2$ was set.', 'x^2', true))).toBe(true);
		expect(shows(stateAt('Up 50% since $x^2$ was set.', 'x^2'))).toBe(false);
	});

	it('Markdown code holds no math, also after an edit lines away makes it code', () => {
		expect(shows(stateAt('Run `cd $x$` first', 'x', true))).toBe(false);

		const span = stateAt('Run cd\nhere and there\nand $x$ now` ok', 'x', true);
		expect(shows(span)).toBe(true);
		expect(shows(span.update({ changes: { from: 4, insert: '`' } }).state)).toBe(false);

		const indented = stateAt('para\n\n    a\n    b\n    $x$ c', 'x', true);
		expect(shows(indented)).toBe(false);
		expect(shows(indented.update({ changes: { from: 6, insert: 'z' } }).state)).toBe(true);
	});

	it('reads the tree the editor already parsed instead of parsing the text again', () => {
		const doc = 'A paragraph of the preview test with $x^2$ in it.\n';
		const state = EditorState.create({ doc, selection: { anchor: doc.indexOf('x^2') + 1 }, extensions: [latexLanguage, mathPreview()] });
		expect(shows(state)).toBe(true);
		expect(latexTreeOf(doc)).toBe(ensureSyntaxTree(state, doc.length, 1000));
	});
});
