// @vitest-environment jsdom
// a .bbl pasted into thebibliography defines its own macros before the first \bibitem, built on the kernel's pickers
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { scanMacroDefinitions } from '$lib/editor/source/extensions/math-preview/userMacros';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const SETUP = String.raw`\begin{thebibliography}{1}%
  \makeatletter
  \providecommand \natexlab [1]{#1}%
  \providecommand \bibnamefont  [1]{#1}%
  \providecommand \bibfnamefont [1]{#1}%
  \providecommand \href@noop [0]{\@secondoftwo}%
  \providecommand \bibinfo  [0]{\@secondoftwo}%
  \providecommand \bibfield  [0]{\@secondoftwo}%
  \providecommand \BibitemOpen [0]{}%
  \providecommand \bibitemNoStop [0]{.\EOS\space}%
  \providecommand \EOS [0]{\spacefactor3000\relax}%
  \providecommand \BibitemShut  [1]{\csname bibitem#1\endcsname}%
  \bibitem [{\citenamefont {Bohr}(1972)}]{bohr}%
    \BibitemOpen
    \bibfield  {author} {\bibinfo {author} {\bibfnamefont {N.}~\bibnamefont {Bohr}},\ }\href@noop {} {Studies}\BibitemShut {NoStop}%
\end{thebibliography}`;

const file = `\\documentclass{article}\n\\begin{document}\n${SETUP}\n\\end{document}\n`;
const text = (source: string) => latexFace(source, false)?.dom.textContent ?? null;

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

describe('a .bbl’s own macros', () => {
	it('print what the paper defines them to print', () => {
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: scanMacroDefinitions(file) };
		expect(text(String.raw`\bibinfo {author} {\bibfnamefont {N.}~\bibnamefont {Bohr}}`)).toBe('N. Bohr');
		expect(text(String.raw`\href@noop {} {Studies}`)).toBe('Studies');
		expect(text(String.raw`\BibitemShut {NoStop}`)).toBe('. ');
		expect(text(String.raw`{\natexlab{a}}`)).toBe('a');
	});

	it('draws a call the chip ends before its printed argument as a quiet mark', () => {
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: scanMacroDefinitions(String.raw`\providecommand{\bibinfo}[2]{#2}`)
		};
		const face = latexFace(String.raw`\bibinfo{journal}`, false);
		expect(face?.dom.className).toBe('drawn-switch');
	});

	it('reads a field macro that names \\@secondoftwo with both its arguments, so the field name is no text', () => {
		const parsed = parseLatexFile(file);
		let entry = '';
		parsed.doc.descendants((node) => {
			if (node.type.name === 'list') entry = node.textContent;
			return node.type.name !== 'list';
		});
		expect(entry).toContain('\\bibfield  {author} {\\bibinfo');
		expect(entry).not.toMatch(/BibitemOpen\s*author/);
	});
});
