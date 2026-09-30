// The LaTeX symbol table generated from Detexify, and searching it: every symbol has a picture
// inside the sheet and a tab, and a search by command or by meaning finds the symbol meant.
import { describe, expect, it } from 'vitest';
import { LATEX_SYMBOL_GROUPS, LATEX_SYMBOL_SHEET } from '$lib/languages/latex/symbols/latexSymbolGroups';
import { latexSymbolById, latexSymbolList } from '$lib/languages/latex/symbols/latexSymbols';
import { searchLatexSymbols } from '$lib/languages/latex/symbols/latexSymbolSearch';

describe('LaTeX symbol table', () => {
	it('draws every symbol from inside the sheet, under a tab, with an id of its own', () => {
		const list = latexSymbolList();
		expect(list.length).toBeGreaterThan(1000);
		expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
		for (const { picture: p, id } of list) {
			if ('letter' in p) continue;
			expect(p.x >= 0 && p.y >= 0 && p.width > 0 && p.height > 0, id).toBe(true);
			expect(p.x + p.width <= LATEX_SYMBOL_SHEET.width && p.y + p.height <= LATEX_SYMBOL_SHEET.height, id).toBe(true);
		}
		for (const group of LATEX_SYMBOL_GROUPS)
			expect(
				list.some((s) => s.group === group),
				group
			).toBe(true);
		expect(latexSymbolById('amssymb-OT1-_subsetneq')?.package).toBe('amssymb');
		// Detexify's inequalities run on from amssymb's list, but they are the kernel's
		expect(latexSymbolById('latex2e-OT1-_leq')?.package).toBe('');
		expect(latexSymbolById('amsfonts-OT1-_mathbb{R}')?.picture).toEqual({ letter: 'ℝ' });
	});
});

describe('searchLatexSymbols', () => {
	const list = latexSymbolList();
	const first = (query: string) => searchLatexSymbols(list, query)[0]?.command;

	it('finds a command by name, with or without its backslash, the kernel copy first', () => {
		expect(first('alpha')).toBe('\\alpha');
		expect(first('\\subsetneq')).toBe('\\subsetneq');
		expect(searchLatexSymbols(list, 'rightarrow').map((s) => s.command)).toContain('\\longrightarrow');
		expect(first('right arrow')).toBe('\\rightarrow');
	});

	it('finds a symbol by what it means, and ranks a recent pick higher', () => {
		expect(first('not equal')).toBe('\\neq');
		expect(first('infinity')).toBe('\\infty');
		const leq = searchLatexSymbols(list, 'less equal').map((s) => s.command);
		expect(leq[0]).toBe('\\leq');
		expect(leq).toContain('\\leqslant');
		expect(searchLatexSymbols(list, 'not less').map((s) => s.command)).toContain('\\nleq');
		const [, second, third] = searchLatexSymbols(list, 'arrow');
		const ranked = searchLatexSymbols(list, 'arrow', [third.id]);
		expect(ranked.indexOf(third)).toBeLessThan(ranked.indexOf(second));
	});
});
