import { describe, expect, it } from 'vitest';
import { columnTypeWorksIn } from '$lib/languages/latex/knowledge/registries/columnTypes';

describe('columnTypeWorksIn', () => {
	it('offers X in tabularx and xltabular only', () => {
		expect(columnTypeWorksIn('X', 'tabularx')).toBe(true);
		expect(columnTypeWorksIn('X', 'xltabular')).toBe(true);
		expect(columnTypeWorksIn('X', 'tabular')).toBe(false);
		expect(columnTypeWorksIn('X', 'tabulary')).toBe(false);
		expect(columnTypeWorksIn('c', 'tabulary')).toBe(true);
	});
});
