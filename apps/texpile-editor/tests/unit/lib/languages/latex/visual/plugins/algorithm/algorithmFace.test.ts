// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { BASE_PACKAGE_TABLE, packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';

afterEach(() => {
	documentTable.current = BASE_PACKAGE_TABLE;
});

describe('algorithms in chips', () => {
	it('draws algorithmic as numbered steps, keywords bold and blocks indented', async () => {
		documentTable.current = packageTableOf(await parsedPackages('\\usepackage{algorithmic}'));
		const source = [
			'\\begin{algorithmic}[1]',
			'\\REQUIRE{A policy $\\pi$}',
			'\\FOR[over episodes]{$e=1,2$}',
			'\\STATE{Init $D$}',
			'\\ENDFOR',
			'\\end{algorithmic}'
		].join('\n');
		const lines = [...(latexFace(source, true)?.dom.querySelectorAll<HTMLElement>('.drawn-algorithm-line') ?? [])];
		expect(lines.map((line) => line.querySelector('strong')?.textContent ?? '')).toEqual(['Require:', 'for', '', 'end for']);
		expect(lines.map((line) => line.style.paddingInlineStart)).toEqual(['0em', '0em', '1.5em', '0em']);
		expect(lines[1].querySelector('.drawn-algorithm-comment')?.textContent).toBe('▷ over episodes');
		expect(lines[3].querySelector('.drawn-algorithm-number')?.textContent).toBe('4:');
	});

	it('draws algpseudocode steps, which algorithmicx lists as items, and algorithm2e blank line as its skip', async () => {
		documentTable.current = packageTableOf(await parsedPackages('\\usepackage{algorithm,algpseudocode}'));
		const face = latexFace('\\begin{algorithmic}[1]\n\\Require{A video}\n\\State{$x$}\n\\end{algorithmic}', true);
		const lines = [...(face?.dom.querySelectorAll('.drawn-algorithm-line') ?? [])];
		expect(lines.map((line) => line.querySelector('strong')?.textContent ?? '')).toEqual(['Require:', '']);
		expect(latexFace('\\BlankLine', false)?.dom.className).toBe('drawn-vspace');
	});

	it('draws a LyX algorithm step as a new line led by its keyword', () => {
		expect(latexFace('\\item [{for}]', false)?.dom.querySelector('strong')?.textContent).toBe('for');
		const steps = latexFace('\\item [{endif}]~\n\\item [{{*}}]', false);
		expect([...(steps?.dom.querySelectorAll('.drawn-algorithm-item') ?? [])].map((item) => item.textContent)).toEqual(['end if', '']);
	});
});
