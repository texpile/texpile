import { describe, expect, it } from 'vitest';
import { importedFunctions, loadPackage, loadedPackage } from '$lib/languages/typst/knowledge';

const NAMES = (source: string) => importedFunctions(source, loadedPackage).map((p) => [p.name, p.functions.map((f) => f.name)]);

describe('the functions a file imports that take a body', () => {
	it('reads a named list, a module and a star import, and leaves out hidden wrappers and templates', async () => {
		for (const spec of [
			'@preview/gentle-clues:1.3.1',
			'@preview/ctheorems:1.1.3',
			'@preview/charged-ieee:0.1.4',
			'@preview/showybox:2.0.4'
		])
			await loadPackage(spec, null);
		expect(NAMES('#import "@preview/gentle-clues:1.3.1": info, tip as hint')).toEqual([['gentle-clues', ['info', 'hint']]]);
		expect(NAMES('#import "@preview/showybox:2.0.4" as sb')).toEqual([['showybox', ['sb.showybox']]]);
		// proof-bodyfmt is hidden, thmbox needs its identifier and head, ieee is a template
		expect(NAMES('#import "@preview/ctheorems:1.1.3": *\n#import "@preview/charged-ieee:0.1.4": *')).toEqual([]);
	});
});
