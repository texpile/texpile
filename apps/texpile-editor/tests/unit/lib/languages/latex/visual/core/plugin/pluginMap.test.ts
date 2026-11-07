// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexPlugins } from '$lib/languages/latex/visual/latexPlugins';

describe('latexPlugins', () => {
	it('lists each name once, so no order between two plugins decides what a name draws', () => {
		const twice: string[] = [];
		for (const kind of ['commands', 'environments'] as const) {
			const seen = new Set<string>();
			for (const name of latexPlugins.flatMap((plugin) => plugin[kind] ?? [])) {
				if (seen.has(name)) twice.push(`${kind} ${name}`);
				seen.add(name);
			}
		}
		expect(twice).toEqual([]);
	});
});
