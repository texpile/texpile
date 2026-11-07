// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

describe('inline faces', () => {
	it('draws a margin note as a small chip holding its text', () => {
		const note = latexFace(String.raw`\marginpar{Is there a \textbf{lower} bound?}`, false);
		expect(note?.dom.className).toBe('drawn-margin-note');
		expect(note?.dom.textContent).toBe('Is there a lower bound?');
	});

	it('draws a formula inside styled text, and leaves one standing in the chip itself as source', () => {
		const styled = latexFace(String.raw`\textup{Let $\alpha$ be small}`, false);
		expect(styled?.dom.querySelector('.math-static-placeholder')?.getAttribute('aria-label')).toBe(String.raw`\alpha`);
		expect(latexFace(String.raw`\textbf{x} $y$`, false)).toBeNull();
	});

	it('draws \\qed as the symbol it prints', () => {
		expect(latexFace(String.raw`\qed`, false)?.dom.textContent).toBe('□');
	});

	it('folds an environment LaTeX skips to a comment line and an acronym list to its short forms', () => {
		const skipped = latexFace('\\begin{comment}\nseparator between\nsimilar environments\n\\end{comment}', true);
		expect(skipped?.line).toBe(true);
		expect(skipped?.dom.textContent).toContain('separator between');
		const list = latexFace(
			'\\begin{acronym}[UML]\n\\acro{AI}{Artificial Intelligence}\n\\acro{ML}{Machine Learning}\n\\end{acronym}',
			true
		);
		expect(list?.dom.textContent).toBe('Acronyms (2): AI, ML');
		expect(drawnCommand('\\begin{comment} x \\end{comment}')).toBe(true);
	});

	it('draws a citation inside a paper’s own macro as the citation widget does', () => {
		referenceStore.current = [{ key: 'KAP15', author: 'Kapetanios, George', year: '2015' } as unknown as BiblatexReference];
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { KAP: { def: '\\citetalias{KAP15}', args: 0 }, newcite: { def: '\\citet', args: 0 } }
		};
		expect(latexFace(String.raw`\KAP{}`, false)?.dom.textContent).toBe('Kapetanios (2015)');
		// an alias takes the call's arguments on to the command it names
		expect(latexFace(String.raw`\newcite{KAP15}`, false)?.dom.textContent).toBe('Kapetanios (2015)');
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
		referenceStore.current = null;
	});
});
