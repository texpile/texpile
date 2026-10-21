// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/extensions/drawn/latexFace';
import { templateFeaturesStore } from '$lib/stores/editorStore';

const draw = (source: string, block = false) => latexFace(source, block);
const text = (source: string) => draw(source)?.dom.textContent ?? null;

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

describe('latexFace', () => {
	it('draws spacing, page breaks, comments and the bibliography on lines of their own', () => {
		expect(draw(String.raw`\vspace{-0.63em}`)?.line).toBe(true);
		expect(draw(String.raw`\bigskip`)?.line).toBe(true);
		expect(draw('% first\n% second')?.dom.textContent).toContain('+1 line');
		const island = draw('\\clearpage\n\\newpage\n\\bibliographystyle{plain}\n\\bibliography{refs}', true);
		expect(island?.line).toBe(true);
		expect(island?.dom.textContent).toContain('Bibliography style · plain');
		expect(island?.dom.textContent).toContain('Bibliography · refs');
		// a vertical space before the text of a paragraph keeps that text in the paragraph
		expect(draw(String.raw`\medskip {\bf (1)}`)?.mixed).toBe(true);
	});

	it('draws characters, styled text and the paper’s own macros as what they print', () => {
		expect(text(String.raw`\'e`)).toBe('é');
		expect(text(String.raw`\v c`)).toBe('č');
		expect(text(String.raw`\AA `)).toBe('Å');
		expect(text(String.raw`{\bf Parser}`)).toBe('Parser');
		expect(text(String.raw`\textsc{Ready}`)).toBe('Ready');
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { bert: { def: 'BERT\\xspace', args: 0 }, d: { def: '\\mathrm{d}', args: 0 } }
		};
		expect(text(String.raw`\bert`)).toBe('BERT');
		// the paper's own \d is no dot-under accent
		expect(draw(String.raw`\d x`)).toBeNull();
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { note: { def: '\\textcolor{#1}{#2}', args: 2, optional: 'red' }, todo: { def: '{\\color{blue}[#1]}', args: 1 } }
		};
		const note = draw(String.raw`\note[teal]{needs a citation}`);
		expect(note?.dom.textContent).toBe('needs a citation');
		expect(note?.dom.querySelector<HTMLElement>('[style]')?.style.color).toBe('rgb(0, 128, 128)');
		expect(text(String.raw`\todo{check}`)).toBe('[check]');
	});

	it('never draws words standing in the chip itself as if they were the text', () => {
		expect(draw('\\clearpage\n\nokay this is cool\n\n\\appendix', true)).toBeNull();
		expect(draw(String.raw`\footnote{a note} and more`)).toBeNull();
	});

	it('keeps the spaces between drawn parts in the text', () => {
		expect(text(String.raw`{\bf bold} {\it italic}`)).toBe('bold italic');
	});

	it('leaves a chip with any part it cannot draw as source', () => {
		expect(draw(String.raw`\unknowncommand{x}`)).toBeNull();
		expect(draw('\\clearpage\n\\begin{figure}x\\end{figure}', true)).toBeNull();
		expect(draw(String.raw`{\bf $x$}`)).toBeNull();
	});
});
