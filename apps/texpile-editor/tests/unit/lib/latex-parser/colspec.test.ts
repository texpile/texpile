import { describe, it, expect } from 'vitest';
import { parseColspec, generateColspec } from '../../../../src/lib/languages/latex/parser/colspec';
import { loadFiles } from '$lib/languages/latex/knowledge/loadedFiles';
import { loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';

describe('parseColspec / generateColspec', () => {
	it('parses simple alignments + rules and round-trips', () => {
		const m = parseColspec('|l|c|r|')!;
		expect(m.columns.map((c) => c.align)).toEqual(['l', 'c', 'r']);
		expect(m.rules).toEqual([true, true, true, true]);
		expect(generateColspec(m)).toBe('|l|c|r|');
	});

	it('parses no-rule specs', () => {
		const m = parseColspec('lcr')!;
		expect(m.rules).toEqual([false, false, false, false]);
		expect(generateColspec(m)).toBe('lcr');
	});

	it('parses p/m/b with widths', () => {
		const m = parseColspec('l p{3cm} c')!;
		expect(m.columns).toEqual([{ align: 'l' }, { align: 'p', width: '3cm' }, { align: 'c' }]);
		expect(generateColspec(m)).toBe('lp{3cm}c');
	});

	it('parses tabularx X / C columns', () => {
		expect(parseColspec('|X|X|')!.columns.map((c) => c.align)).toEqual(['X', 'X']);
	});

	it('handles non-uniform rules (rule only between cols)', () => {
		const m = parseColspec('l|cc')!;
		expect(m.rules).toEqual([false, true, false, false]);
		expect(generateColspec(m)).toBe('l|cc');
	});

	it('returns null for specs it cannot model (raw fallback)', () => {
		expect(parseColspec('>{\\centering}p{3cm}')).toBeNull();
		expect(parseColspec('l@{}c')).toBeNull();
		expect(parseColspec('*{3}{c}')).toBeNull();
		expect(parseColspec('S[table-format=2.2]')).toBeNull();
		expect(parseColspec('p')).toBeNull(); // p without width
	});

	it('round-trips a width-bearing spec generated from an edit', () => {
		const m = parseColspec('|l|c|p{2cm}|')!;
		m.columns[1].align = 'r'; // edit the middle column
		expect(generateColspec(m)).toBe('|l|r|p{2cm}|');
	});

	it('reads the column types the loaded files provide', async () => {
		const kernel = loadedRegistry(await loadFiles([{ name: 'latex-document', options: [] }], [], null), 'columnTypes');
		const array = loadedRegistry(
			await loadFiles(
				[
					{ name: 'latex-document', options: [] },
					{ name: 'array', options: [] }
				],
				[],
				null
			),
			'columnTypes'
		);
		expect(parseColspec('l m{2cm}', kernel)).toBeNull();
		expect(parseColspec('l m{2cm}', array)?.columns).toEqual([{ align: 'l' }, { align: 'm', width: '2cm' }]);
		expect(parseColspec('lN')?.columns).toHaveLength(2);
		expect(parseColspec('lN', kernel)).toBeNull();
	});
});
