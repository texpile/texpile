import { describe, expect, it } from 'vitest';
import { documentFileIds, documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { latexInsertItems } from '$lib/languages/latex/visual/core/plugin/insertList';

async function itemsOf(preamble: string) {
	const text = `${preamble}\n\\begin{document}\n`;
	const items = latexInsertItems({ loaded: await documentPackages(text), direct: documentFileIds(text), definitions: text });
	const ids = (category: string) => items.filter((i) => i.category === category).map((i) => i.id);
	return { items, ids };
}

describe('the insert list', () => {
	it('gives an article its sections from the class, and no chapter', async () => {
		const { ids } = await itemsOf('\\documentclass{article}');
		expect(ids('sectioning')).toEqual(['part', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']);
		expect(ids('frontMatter')).toContain('abstract');
		expect(ids('frames')).toEqual([]);
	});

	it('gives a book and a report their chapter, and a book no abstract', async () => {
		const book = await itemsOf('\\documentclass{book}');
		const report = await itemsOf('\\documentclass{report}');
		expect(book.ids('sectioning').slice(0, 3)).toEqual(['part', 'chapter', 'section']);
		expect(report.ids('sectioning').slice(0, 3)).toEqual(['part', 'chapter', 'section']);
		expect(book.ids('frontMatter')).not.toContain('abstract');
		expect(report.ids('frontMatter')).toContain('abstract');
	});

	it("gives a Beamer deck its frames, blocks and theorems once, under LyX's categories", async () => {
		const { ids } = await itemsOf('\\documentclass{beamer}');
		expect(ids('frames')).toEqual(['frame']);
		expect(ids('blocks')).toEqual(['alertblock', 'block', 'exampleblock']);
		expect(ids('columns')).toEqual(['columns']);
		expect(ids('titling')).toEqual(expect.arrayContaining(['title', 'subtitle', 'author', 'institute', 'date']));
		expect(ids('theorems')).toEqual(expect.arrayContaining(['env:theorem', 'env:lemma', 'env:proof']));
		expect(ids('theorems')).not.toContain('env:Satz');
		expect(ids('theorems')).not.toContain('env:Theorem');
		expect(ids('textStyles')).toEqual(expect.arrayContaining(['\\alert', '\\uncover']));
	});

	it("offers the paper's own theorem by the word it prints", async () => {
		const { items } = await itemsOf('\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{lem}{Lemma}');
		expect(items.find((i) => i.id === 'env:lem')).toMatchObject({ category: 'theorems', label: 'Lemma', style: true });
	});

	it('leaves out a display that needs an argument the math editor cannot ask for', async () => {
		const { ids } = await itemsOf('\\documentclass{article}\n\\usepackage{amsmath}');
		expect(ids('math')).toContain('math:align');
		expect(ids('math')).not.toContain('math:xalignat');
	});
});
