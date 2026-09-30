import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { footnoteNumbersKey, footnoteNumbersPlugin, footnoteNumbersOf } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { latexFootnoteMarks } from '$lib/languages/latex/visual/extensions/drawn/latexFootnoteMarks';

const chip = (text: string) => schema.node('inline_latex', null, [schema.text(text)]);

describe('latexFootnoteMarks', () => {
	it('counts as LaTeX does: a given number steps nothing, a commented one is not there', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [
				schema.text('a'),
				chip('\\footnote{one}'),
				chip('\\footnote[7]{given}'),
				chip('% \\footnote{commented}'),
				chip('\\footnotemark\\footnote{three}')
			])
		]);
		const state = EditorState.create({ doc, plugins: [footnoteNumbersPlugin(latexFootnoteMarks)] });
		const numbers = footnoteNumbersKey
			.getState(state)!
			.find()
			.map((d) => footnoteNumbersOf([d]));
		expect(numbers).toEqual([[1], [7], [2, 3]]);
	});
});
