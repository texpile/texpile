// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { typstPlugins } from '$lib/languages/typst/visual/typstPlugins';
import { typstDocumentPlugins } from '$lib/languages/typst/visual/typstDocumentPlugins';

describe('typstDocumentPlugins', () => {
	it('holds the document part of every plugin, once, and nothing else', () => {
		const parts = typstPlugins.flatMap((plugin) => (plugin.document ? [plugin.document] : []));
		expect(new Set(typstDocumentPlugins).size).toBe(typstDocumentPlugins.length);
		expect(new Set(typstDocumentPlugins)).toEqual(new Set(parts));
	});
});
