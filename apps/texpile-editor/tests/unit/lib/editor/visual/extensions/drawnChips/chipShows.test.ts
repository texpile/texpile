// @vitest-environment jsdom
// what the keys ask of a raw chip, answered from the node before any view lays it out
import { describe, expect, it } from 'vitest';
import { chipShows, drawnChipOf } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { registerLatexCoreDrawing } from '$lib/languages/latex/visual/core/faces/latexCoreDrawing';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { typstNodeViews } from '$lib/languages/typst/visual/typstNodeViews';
import { typSchema } from '$lib/languages/typst/visual/schema';

registerLatexCoreDrawing();
typstNodeViews(() => '');

const inline = (source: string) => schema.nodes.inline_latex.create(null, schema.text(source));
const block = (source: string) => schema.nodes.raw_latex.create(null, schema.text(source));

describe('a LaTeX chip never laid out', () => {
	it('stands on a line of its own, in the text, or as one character, as its face draws', () => {
		expect(drawnChipOf(inline('\\vspace{1em}'))).toEqual({ ownLine: true, character: false });
		expect(drawnChipOf(inline('\\footnote{A note.}'))).toEqual({ ownLine: false, character: false });
		expect(drawnChipOf(inline('\\hspace{1em}'))).toEqual({ ownLine: false, character: true });
		expect(drawnChipOf(block('\\vspace{2em}'))).toEqual({ ownLine: true, character: false });
		expect(drawnChipOf(inline('\\textbf{bold}'))).toEqual({ ownLine: false, character: false });
	});

	// the DOM editor drew such a block; the canvas left it source
	it('draws a block whose parts stand on lines of their own and in the text, and keeps such an inline chip source', () => {
		const parts = '\\vspace{1em} \\textbf{bold}';
		expect(drawnChipOf(block(parts))).toEqual({ ownLine: true, character: false });
		expect(drawnChipOf(inline(parts))).toBeNull();
	});

	it('a placeholder stays one until its face is ported', () => {
		expect(chipShows(block('\\tableofcontents'))).toBe('placeholder');
		expect(drawnChipOf(block('\\tableofcontents'))).toBeNull();
	});

	// every plugin face drawn on the canvas: one still built of HTML would leave its chip as source
	it.each([
		['\\nocite{a,b}', inline],
		['\\pause', inline],
		['\\verb|w|', inline],
		['\\color{red}', inline],
		['\\marginpar{A note.}', inline],
		['\\includegraphics{plot.png}', inline],
		['\\caption{Words.}', inline],
		['\\cref{sec:a}', inline],
		['\\cite{key}', inline],
		['\\titlepage', block],
		['\\begin{itemize}\\item One.\\end{itemize}', block],
		['\\begin{algorithmic}\\State x\\end{algorithmic}', block]
	])('%s draws on the canvas', (source, make) => {
		expect(drawnChipOf(make(source))).not.toBeNull();
	});
});

it('a Markdown chip is always its source', () => {
	const chip = mdSchema.nodes.inline_latex.create(null, mdSchema.text('\\vspace{1em}'));
	expect(chipShows(chip)).toBe('island');
	expect(drawnChipOf(chip)).toBeNull();
});

it('a Typst set rule draws as its line of settings', () => {
	const chip = typSchema.nodes.raw_latex.create(null, typSchema.text('#set heading(numbering: "1.")'));
	expect(drawnChipOf(chip)).toEqual({ ownLine: true, character: false });
});

// every Typst plugin face drawn on the canvas: one still built of HTML would leave its chip as source
it.each([
	['#line(length: 2cm)', true],
	['#stack(dir: ltr, [a], [b])', true],
	['#table(columns: 2, [a], [b])', true],
	['#lorem(5)', false]
])('Typst %s draws on the canvas', (source, block) => {
	const chip = block
		? typSchema.nodes.raw_latex.create(null, typSchema.text(source))
		: typSchema.nodes.inline_latex.create(null, typSchema.text(source));
	expect(drawnChipOf(chip)).not.toBeNull();
});
