// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexPlugins } from '$lib/languages/latex/visual/latexPlugins';
import { latexDocumentPlugins } from '$lib/languages/latex/visual/latexDocumentPlugins';

describe('latexDocumentPlugins', () => {
	it('holds the document part of every plugin, once, and nothing else', () => {
		const parts = latexPlugins.flatMap((plugin) => (plugin.document ? [plugin.document] : []));
		expect(new Set(latexDocumentPlugins).size).toBe(latexDocumentPlugins.length);
		expect(new Set(latexDocumentPlugins)).toEqual(new Set(parts));
	});
});
