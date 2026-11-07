// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { citeAliasesIn } from '$lib/languages/latex/visual/core/definitions/citeAliases';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf, BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore, EMPTY_PROJECT_INTEL } from '$lib/stores/projectIntel';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

const reference = (key: string, author: string, year: string) => ({ key, author, year }) as unknown as BiblatexReference;

const biblatex = '\\documentclass{article}\n\\usepackage{biblatex}\n\\begin{document}';
let table = BASE_PACKAGE_TABLE;

beforeAll(async () => {
	table = packageTableOf(await parsedPackages(biblatex));
});

afterEach(() => {
	documentTable.current = BASE_PACKAGE_TABLE;
	referenceStore.current = null;
	templateFeaturesStore.current = { ...templateFeaturesStore.current, citeAliases: undefined };
	projectIntelStore.current = EMPTY_PROJECT_INTEL;
});

describe('citation faces', () => {
	it('draws a call with several groups of keys as one citation holding every group', () => {
		documentTable.current = table;
		referenceStore.current = [reference('a', 'Smith, Ann', '2000'), reference('b', 'Jones, Bob', '2001')];
		const face = latexFace(String.raw`\parencites(see)(also)[p.~1]{a}[p.~2]{b}`, false);
		expect(face?.dom.textContent).toBe('(see Smith 2000, p.\u00a01; Jones 2001, p.\u00a02 also)');
		// the second group belongs to the call, so the parse keeps both in one chip
		const parsed = parseLatexFile(`${biblatex}\nSee \\textcites{a}{b} here.\n\\end{document}`, '', undefined, table);
		const chips: string[] = [];
		parsed.doc.descendants((node) => {
			if (node.type.name === 'inline_latex') chips.push(node.textContent);
		});
		expect(chips).toEqual([String.raw`\textcites{a}{b}`]);
	});

	it('draws a footnote citation as the footnote mark and a superscript citation raised', () => {
		documentTable.current = table;
		referenceStore.current = [reference('a', 'Smith, Ann', '2000')];
		expect(latexFace(String.raw`\footcite[p.~2]{a}`, false)?.dom.className).toBe('drawn-footnote');
		const raised = latexFace(String.raw`\supercite{a}`, false);
		expect(raised?.dom.tagName).toBe('SUP');
		expect(raised?.dom.textContent).toBe('Smith 2000');
	});

	it('prints the short name a paper gives a key, and shows the definition quietly', () => {
		documentTable.current = packageTableOf([]);
		const text = '\\defcitealias{VVW96}{VW}\n% \\defcitealias{old}{X}';
		expect(citeAliasesIn(text)).toEqual({ VVW96: 'VW' });
		templateFeaturesStore.current = { ...templateFeaturesStore.current, citeAliases: { VVW96: 'VW' } };
		referenceStore.current = [reference('VVW96', 'van der Vaart, Aad', '1996')];
		const alias = latexFace(String.raw`\defcitealias{VVW96}{VW}`, false);
		expect(alias?.line).toBe(true);
		expect(alias?.dom.textContent).toBe('VVW96:=VW');
	});

	it('prints a run of labels as a range', () => {
		projectIntelStore.current = {
			...EMPTY_PROJECT_INTEL,
			auxNumbers: { 'sec:a': '1', 'sec:c': '3' },
			auxKinds: { 'sec:a': 'section', 'sec:c': 'section' }
		};
		expect(latexFace(String.raw`\crefrange{sec:a}{sec:c}`, false)?.dom.textContent).toBe('sections\u00a01 to 3');
	});
});
