import { describe, expect, it } from 'vitest';
import { loadFiles } from '$lib/languages/latex/knowledge/loadedFiles';
import { commonRegistry, loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';

describe('registries', () => {
	it('gives an option color only under its option', async () => {
		const names = async (options: string[]) =>
			loadedRegistry(await loadFiles([{ name: 'xcolor', options }], [], null), 'colors').map((c) => c.name);
		expect(await names([])).toContain('teal');
		expect(await names([])).not.toContain('Apricot');
		expect(await names(['dvipsnames'])).toContain('Apricot');
	});

	it('keeps a class its own counters when a package it loads has them too', async () => {
		const counters = loadedRegistry(await loadFiles([{ name: 'class-amsart', options: [] }], [], null), 'counters').map((c) => c.name);
		expect(counters).toEqual(expect.arrayContaining(['section', 'MaxMatrixCols']));
	});

	it('fills a common color from the file that states its value', () => {
		expect(commonRegistry('colors').find((c) => c.name === 'red')?.value).toBe('rgb:1,0,0');
	});
});
