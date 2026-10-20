import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';

function blocks(body: string, options: Parameters<typeof latexToProseMirror>[1] = {}): Node[] {
	const out: Node[] = [];
	latexToProseMirror(body, options).doc.forEach((n) => out.push(n));
	return out;
}

describe('block conversion reads environment facts from the package table', () => {
	it('keeps a math environment the editor has no widget for as a chip with its name', () => {
		for (const src of [
			'\\begin{xalignat}{2}\na&=b&c&=d\n\\end{xalignat}',
			'\\begin{dmath}\na=b\n\\end{dmath}',
			'\\begin{pmatrix}\na&b\n\\end{pmatrix}'
		]) {
			const [block] = blocks(src);
			expect(block.type.name).toBe('raw_latex');
			expect(block.textContent).toBe(src);
		}
	});

	it('keeps a display holding a diagram as a chip, and one holding a matrix as a formula', () => {
		for (const src of [
			'\\[\n\\begin{tikzcd}\nA \\arrow[r] & B\n\\end{tikzcd}\n\\]',
			'\\begin{equation}\n\\begin{tikzcd}\nA\n\\end{tikzcd}\n\\end{equation}'
		]) {
			const [block] = blocks(src);
			expect(block.type.name).toBe('raw_latex');
			expect(block.textContent).toBe(src);
		}
		expect(blocks('\\[\n\\begin{pmatrix}\na&b\n\\end{pmatrix}\n\\]')[0].type.name).toBe('block_math');
	});

	it('numbers a formula block by the environment numbering', () => {
		const numbered = (src: string) => blocks(src)[0].attrs.numbered;
		expect(numbered('\\begin{equation}\na\n\\end{equation}')).toBe(true);
		expect(numbered('\\begin{align}\na&=b\n\\end{align}')).toBe(true);
		expect(numbered('\\begin{equation*}\na\n\\end{equation*}')).toBe(false);
		expect(numbered('\\begin{gather*}\na\n\\end{gather*}')).toBe(false);
		expect(numbered('\\begin{displaymath}\na\n\\end{displaymath}')).toBe(false);
	});

	it('turns an environment into list items only when the table gives it item commands', () => {
		const src = '\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}';
		expect(blocks(src).map((n) => n.type.name)).toEqual(['list', 'list']);
		const table = { ...BASE_PACKAGE_TABLE, bodies: { ...BASE_PACKAGE_TABLE.bodies, itemize: {} } };
		const [chip] = blocks(src, { table });
		expect(chip.type.name).toBe('raw_latex');
		expect(chip.textContent).toBe(src);
	});

	it('keeps a modeled environment whose body a loaded file reads verbatim as a chip, text and all', () => {
		// smfart keeps its abstract for \maketitle; the abstract widget would take the body as parsed content and drop it
		const src = "\\begin{abstract}\nOn d\\'emontre.\n\\end{abstract}";
		const table = { ...BASE_PACKAGE_TABLE, bodies: { ...BASE_PACKAGE_TABLE.bodies, abstract: { body: 'comment' as const } } };
		const [chip] = blocks(src, { table });
		expect(chip.type.name).toBe('raw_latex');
		expect(chip.textContent).toBe(src);
	});
});

describe('block conversion reads sectioning commands from the package data', () => {
	it('a class heading and a part start blocks of their own', () => {
		for (const heading of ['\\specialsection{Name}', '\\Subsection{Name}', '\\part{Name}']) {
			const kinds = blocks(`Intro text\n${heading}\nmore text`).map((n) => n.type.name);
			expect(kinds).toEqual(['paragraph', expect.any(String), 'paragraph']);
		}
	});
});
