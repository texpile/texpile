// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { BASE_PACKAGE_TABLE, packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';

const draw = (source: string, block = false) => latexFace(source, block);
const text = (source: string) => draw(source)?.dom.textContent ?? null;

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
	documentTable.current = BASE_PACKAGE_TABLE;
});

describe('latexFace', () => {
	it('draws spacing, page breaks, comments and the bibliography on lines of their own', () => {
		expect(draw(String.raw`\vspace{-0.63em}`)?.line).toBe(true);
		expect(draw(String.raw`\bigskip`)?.line).toBe(true);
		expect(draw('% first\n% second')?.dom.textContent).toContain('+1 line');
		const island = draw('\\clearpage\n\\newpage\n\\bibliographystyle{plain}\n\\bibliography{refs}', true);
		expect(island?.line).toBe(true);
		expect(island?.dom.textContent).toContain('Bibliography style - plain');
		expect(island?.dom.textContent).toContain('Bibliography - refs');
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
		expect(draw('\\clearpage\n\\begin{figure}\\unknowncommand{x}\\end{figure}', true)).toBeNull();
		expect(draw(String.raw`{\bf \unknowncommand{x}}`)).toBeNull();
	});

	it('draws a switch with nothing to style quiet, and the math and characters a chip holds', () => {
		expect(draw(String.raw`{\LARGE \par}`)?.dom.className).toBe('drawn-switch');
		expect(text(String.raw`\lq`)).toBe('‘');
		expect(draw(String.raw`{\small $\mu$}`)?.dom.querySelector('[role="math"]')).not.toBeNull();
		// an unknown command is no math the typesetter draws
		expect(draw(String.raw`$$\unknowncommand{X} = Y$$`)).toBeNull();
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { EQ: { def: String.raw`\begin{equation}`, args: 0 }, EN: { def: String.raw`\end{equation}`, args: 0 } }
		};
		expect(draw(String.raw`\EQ x=1\label{a} \EN`, true)?.line).toBe(true);
	});
});

describe('the small commands a chip can hold', () => {
	it('draws a call of the paper’s own macro with arguments wherever it stands, and a setter macro as the setting it is', () => {
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { ass: { def: String.raw`\textbf{#1}`, args: 1 }, editor: { def: String.raw`\gdef\@editor{#1}`, args: 1 } }
		};
		expect(text(String.raw`{\it \ass{DGP}}`)).toBe('DGP');
		expect(draw(String.raw`\editor{Koby}`)?.dom.className).toBe('drawn-definitions');
	});

	it('draws a switch followed by an empty group, a label in the text and a macro that expands to nothing', () => {
		expect(draw(String.raw`\large{}`)?.dom.className).toBe('drawn-switch');
		expect(text(String.raw`\textsc{\label{fig:a}Minres}`)).toBe('fig:aMinres');
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: { shortversion: { def: '', args: 1 } } };
		expect(draw(String.raw`\shortversion{\end{document}}`)?.dom.className).toBe('drawn-switch');
	});

	it('draws an environment of running text under its name, and a list that sits inside a group as that list', () => {
		const keywords = draw(String.raw`\begin{keywords}kernel, online\end{keywords}`, true);
		expect(keywords?.dom.querySelector('.drawn-environment-name')?.textContent).toBe('keywords');
		const description = draw('\\begin{description}\n{\\footnotesize\\item PACS: 05 \\item Keywords: a}\n\\end{description}', true);
		expect(description?.dom.querySelectorAll('dd')).toHaveLength(2);
		const numbered = draw(String.raw`\begin{enumerate}\item one \item two $x$\end{enumerate}`);
		expect(numbered?.dom.tagName).toBe('OL');
		expect(numbered?.dom.querySelectorAll('li')).toHaveLength(2);
	});

	it('draws what the data says a command prints, and the text a command sets', async () => {
		const preamble = String.raw`\documentclass{elsarticle}\usepackage[english]{babel}\usepackage{scalefnt}`;
		documentTable.current = packageTableOf(await parsedPackages(preamble));
		expect(text(String.raw`\sep`)).toBe(', ');
		expect(text(String.raw`\foreignlanguage{english}{(PIF//15/043}`)).toBe('(PIF//15/043');
		expect(text(String.raw`{\scalefont{0.76}GN}`)).toBe('GN');
		expect(text(String.raw`\parbox{2cm}{KL divergence}`)).toBe('KL divergence');
	});
});
