import { it, expect } from 'vitest';
import { loadHyphenator } from '$lib/editor/canvas/layout/linebreak/hyphenationLanguages';

function split(word: string, points: number[]): string {
	return [0, ...points].map((from, i, all) => word.slice(from, all[i + 1])).join('-');
}

it('splits English words where TeX does, exceptions included', async () => {
	const hyphenate = await loadHyphenator('en-us');
	expect(split('hyphenation', hyphenate('hyphenation'))).toBe('hy-phen-ation');
	expect(split('associate', hyphenate('associate'))).toBe('as-so-ciate');
	expect(hyphenate('also')).toEqual([]);
});

it('reads patterns with letters outside ASCII', async () => {
	const hyphenate = await loadHyphenator('de-1996');
	expect(split('straßenbahn', hyphenate('straßenbahn'))).toBe('stra-ßen-bahn');
});
