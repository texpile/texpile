import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { extractFigureReferences, extractTableReferences } from '$lib/editor/visual/extensions/reference/referenceItems';
import { extractChipLabels } from '$lib/languages/latex/parser/labels';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'inline*' },
		raw_latex: { group: 'block', content: 'text*' },
		text: { group: 'inline' }
	}
});

const FIGURE = `\\begin{figure}[h]
\\centering
\\begin{tikzpicture}
  \\node[draw] (a) at (0,0) {A};
\\end{tikzpicture}
\\caption{Cross section}
\\label{fig:cross-section}
\\end{figure}`;

const TABLE = '\\begin{table}\\begin{tabular}{c}a\\end{tabular}\\label{tab:one}\\end{table}';

function viewOf(...chips: string[]): EditorView {
	const doc = schema.node(
		'doc',
		null,
		chips.map((c) => schema.node('raw_latex', null, schema.text(c)))
	);
	return { state: { doc, schema } } as unknown as EditorView;
}

describe('labels inside raw chips', () => {
	it('reads each label with the environment around it', () => {
		expect(extractChipLabels(`${FIGURE}\n% \\label{commented}`)).toEqual([{ label: 'fig:cross-section', env: 'figure' }]);
	});

	it('the picker offers a figure float drawn as a chip as a figure', () => {
		const figures = extractFigureReferences(viewOf(FIGURE));
		expect(figures.map((f) => [f.type, f.id, f.displayText])).toEqual([['figure', 'fig:cross-section', 'Figure 1']]);
	});

	it('keeps the kinds apart', () => {
		const view = viewOf(FIGURE, TABLE);
		expect(extractTableReferences(view).map((t) => t.id)).toEqual(['tab:one']);
		expect(extractFigureReferences(view).map((f) => f.id)).toEqual(['fig:cross-section']);
	});

	it('numbers subfigures with their figure, so the next figure is still Figure 2', () => {
		const subfigures =
			'\\begin{figure}\\begin{subfigure}{.5\\linewidth}\\label{fig:a}\\end{subfigure}\\begin{subfigure}{.5\\linewidth}\\label{fig:b}\\end{subfigure}\\label{fig:both}\\end{figure}';
		const figures = extractFigureReferences(viewOf(subfigures, FIGURE));
		expect(figures.map((f) => [f.id, f.displayText])).toEqual([
			['fig:a', 'Figure 1'],
			['fig:b', 'Figure 1'],
			['fig:both', 'Figure 1'],
			['fig:cross-section', 'Figure 2']
		]);
	});
});
