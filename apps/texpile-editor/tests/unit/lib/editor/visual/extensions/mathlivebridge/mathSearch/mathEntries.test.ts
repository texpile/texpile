// @vitest-environment jsdom
// The math search finds a name typed with its capital as that name, ahead of its lower case twin
import { describe, expect, it } from 'vitest';
import { loadMathEntries, searchMathEntries } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathEntries';

async function first(syntax: 'latex' | 'typst', query: string): Promise<string> {
	return searchMathEntries(await loadMathEntries(syntax), query)[0].command.name;
}

describe('the math search', () => {
	it('lists the name spelled with the case typed first', async () => {
		expect(await first('latex', 'Delta')).toBe('\\Delta');
		expect(await first('latex', '\\Rightarrow')).toBe('\\Rightarrow');
		expect(await first('latex', 'delta')).toBe('\\delta');
		expect(await first('typst', 'Delta')).toBe('Delta');
	});
});
