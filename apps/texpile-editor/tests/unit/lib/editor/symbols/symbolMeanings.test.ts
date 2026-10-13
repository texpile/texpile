import { describe, expect, it } from 'vitest';
import { SYMBOL_MEANINGS } from '$lib/editor/symbols/symbolMeanings';
import { isTypoOf } from '$lib/editor/symbols/typoMatch';
import { latexSymbolList } from '$lib/languages/latex/symbols/latexSymbols';
import { searchLatexSymbols } from '$lib/languages/latex/symbols/latexSymbolSearch';
import { typstSymbolList } from '$lib/languages/typst/symbols/typstSymbols';
import { searchTypstSymbols } from '$lib/languages/typst/symbols/typstSymbolSearch';

const latex = (query: string, n = 3) =>
	searchLatexSymbols(latexSymbolList(), query)
		.slice(0, n)
		.map((s) => s.command);
const typst = (query: string, n = 3) =>
	searchTypstSymbols(typstSymbolList(), query)
		.slice(0, n)
		.map((s) => s.path);

describe('finding a symbol by what it means', () => {
	it('names only symbols the tables have', () => {
		const commands = new Set(latexSymbolList().map((s) => s.command));
		const paths = new Set(typstSymbolList().map((s) => s.path));
		const missing = SYMBOL_MEANINGS.flatMap(([l, t]) => [
			...l.filter((name) => !commands.has(`\\${name}`)).map((name) => `latex ${name}`),
			...t.filter((name) => !paths.has(name)).map((name) => `typst ${name}`)
		]);
		expect(missing).toEqual([]);
	});

	it('finds the quantity a writer knows the meaning of, in either language', () => {
		expect(latex('stress', 2).sort()).toEqual(['\\sigma', '\\tau']);
		expect(typst('stress', 2).sort()).toEqual(['sigma', 'tau']);
		expect(latex('real numbers', 1)).toEqual(['\\mathbb{R}']);
		expect(latex('distributed as', 1)).toEqual(['\\sim']);
		expect(typst('learning rate')).toContain('eta');
	});

	it('forgives a slip in a word, and only a slip', () => {
		expect(latex('desnity', 1)).toEqual(['\\rho']);
		expect(latex('lamda', 1)).toEqual(['\\lambda']);
		expect(latex('integarl', 1)).toEqual(['\\int']);
		expect(typst('lamda', 1)).toEqual(['lambda']);
		expect(latex('rho', 1)).toEqual(['\\rho']);
		expect([isTypoOf('tho', 'rho'), isTypoOf('alpha', 'aleph'), isTypoOf('zeta', 'beta')]).toEqual([false, false, false]);
	});
});
