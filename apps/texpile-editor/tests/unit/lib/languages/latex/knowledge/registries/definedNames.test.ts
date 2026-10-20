import { describe, expect, it } from 'vitest';
import { definedNames } from '$lib/languages/latex/knowledge/registries/definedNames';

describe('definedNames', () => {
	it('takes a color from \\definecolor and \\colorlet, and a counter from \\newcounter and a counting \\newtheorem only', () => {
		expect(definedNames('\\definecolor{a}{rgb}{1,0,0}\\colorlet{b}{a!50}\\textcolor{c}{x}', 'color')).toEqual(['a', 'b']);
		const code = '\\newcounter{n}\\newtheorem{t}{T}\\newtheorem*{r}{R}\\newtheorem{l}[t]{L}\\newtheorem{c}{C}[section]';
		expect(definedNames(code, 'counter')).toEqual(['n', 't', 'c']);
	});
});
