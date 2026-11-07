// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { BASE_PACKAGE_TABLE, packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { chipCounts } from '$lib/languages/latex/visual/core/plugin/chipCounts';

function chipFootnotes(source: string): (number | null)[] {
	return chipCounts(source).footnote ?? [];
}
import { templateFeaturesStore } from '$lib/stores/editorStore';

async function loading(preamble: string): Promise<void> {
	documentTable.current = packageTableOf(await parsedPackages(preamble));
}

const classes = (name: string) => `\\documentclass{${name}}`;

afterEach(() => {
	documentTable.current = BASE_PACKAGE_TABLE;
});

describe('the title block', () => {
	it('draws each author apart, with the marks and notes written beside the names', async () => {
		await loading(classes('article'));
		const face = latexFace(String.raw`\author{Ada\textsuperscript{1}\thanks{Funded.} \and Grace$^{2}$}`, true);
		expect(face?.dom.className).toBe('title-matter title-matter-author');
		const cells = [...face!.dom.querySelectorAll('.title-matter-cell')];
		expect(cells.map((cell) => cell.textContent)).toEqual(['Ada1∗', 'Grace']);
		expect(cells[1].querySelector('[role="math"]')?.getAttribute('aria-label')).toBe('^{2}');
	});

	it('reads what a class sets from the parts its package data gives the arguments', async () => {
		await loading(classes('revtex4-1'));
		const face = latexFace('\\email{ada@example.org}\n\\affiliation{Engines \\\\ London}\n\\keywords{a \\and b}', true);
		const lines = [...face!.dom.children].map((line) => line.className);
		expect(lines).toEqual([
			'title-matter title-matter-email',
			'title-matter title-matter-affiliation',
			'title-matter title-matter-keywords'
		]);
		expect(face!.dom.querySelector('br')).not.toBeNull();
		expect(face!.dom.querySelector('.title-matter-keywords')?.textContent).toBe('Keywordsa, b');
		// a document that does not load the class has no \affiliation to draw
		await loading(classes('article'));
		expect(latexFace('\\affiliation{Engines}', true)).toBeNull();
	});

	it('draws a macro of the paper that only sets its argument apart as an address', () => {
		const lyxaddress = { def: '\\par {\\raggedright #1\n\\vspace{1.4em}\n\\noindent\\par}', args: 1 };
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: { lyxaddress, labelled: { def: 'Address: #1', args: 1 } } };
		const face = latexFace('\\lyxaddress{Ottawa$^1$\\\\ Canada}', false);
		expect(face?.dom.className).toBe('title-matter title-matter-affiliation');
		expect(face?.dom.querySelector('br')).not.toBeNull();
		// a macro that prints more than its argument is drawn as what it prints
		expect(latexFace('\\labelled{Ottawa}', false)?.dom.textContent).toBe('Address: Ottawa');
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
	});

	it('shows the words of a block whose class markup it has no reading for, a command that takes nothing between its cells', async () => {
		await loading(classes('article'));
		const face = latexFace(
			String.raw`\author{\name Ada Lovelace \email ada@example.org \\ \addr London \AND \name Grace Hopper \IEEEmembership{Fellow}}`,
			true
		);
		expect(face?.dom.className).toBe('title-matter title-matter-author');
		const cells = [...face!.dom.querySelectorAll('.title-matter-cell')].map((cell) => cell.textContent?.trim());
		expect(cells).toEqual(['Ada Lovelace', 'ada@example.org', 'London', 'Grace Hopper', 'Fellow']);
	});

	it('draws the accented letters in the text of a class command', async () => {
		await loading(classes('revtex4-1'));
		expect(latexFace(String.raw`\author{Bal\'azs N\'{e}meth}`, true)?.dom.textContent).toBe('Balázs Németh');
		expect(latexFace(String.raw`\affiliation{Universit\"{a}t Ulm}`, false)?.dom.textContent).toBe('Universität Ulm');
	});

	it('reads the title block commands of a class from the data it ships for it', async () => {
		await loading(classes('svjour3'));
		const face = latexFace(String.raw`\titlerunning{Short} \institute{Dept. A \at a@example.org \and Dept. B} \keywords{x \and y}`, true);
		expect([...face!.dom.children].map((line) => line.className)).toEqual([
			'title-matter title-matter-running',
			'title-matter title-matter-affiliation',
			'title-matter title-matter-keywords'
		]);
		expect(face!.dom.querySelector('.title-matter-running .title-matter-label')?.textContent).toBe('Running head');
	});

	it('leaves the notes of the title block out of the count of page footnotes', () => {
		expect(chipFootnotes(String.raw`\author{Ada\footnote{Note.}}`)).toEqual([]);
		expect(chipFootnotes(String.raw`Ada\footnote{Note.}`)).toEqual([null]);
	});

	it('leaves a chip as source when a part of it cannot be drawn', async () => {
		await loading(classes('article'));
		expect(latexFace(String.raw`\author{Ada $\xymatrix{X \ar[r] & Y}$}`, true)).toBeNull();
	});

	it('keeps the title block apart from the code beside it and saves the file as it was', () => {
		const file = String.raw`\documentclass{article}
\begin{document}
\title{A \textbf{bold} title}
\maketitle
\global\long\def\ph{\phantom{\mu}}
Text.
\end{document}
`;
		const parsed = parseLatexFile(file);
		const chips: string[] = [];
		parsed.doc.forEach((block) => block.type.name === 'raw_latex' && chips.push(block.textContent));
		expect(chips).toEqual([
			String.raw`\title{A \textbf{bold} title}`,
			String.raw`\maketitle`,
			String.raw`\global\long\def\ph{\phantom{\mu}}`
		]);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
	});
});
