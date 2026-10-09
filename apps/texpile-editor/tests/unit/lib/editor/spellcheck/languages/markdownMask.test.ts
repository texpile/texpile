// a dictionary reads Markdown source with its code and addresses blanked, every offset where it was
import { describe, it, expect } from 'vitest';
import { maskMarkdown } from '$lib/editor/spellcheck/languages/markdownMask';

describe('maskMarkdown', () => {
	it('keeps link text and prose, blanks the address, code, a bare URL and the front matter', () => {
		const source =
			'---\nlang: de\n---\n\nSiehe [die Anleitung](https://example.com/a) und `code_wert`, oder https://x.de/b.\n\n```\nnicht prüfen\n```\n';
		const masked = maskMarkdown(source);
		expect(masked).toHaveLength(source.length);
		expect(masked.split(/\s+/).filter(Boolean)).toEqual(['Siehe', '[die', 'Anleitung', 'und', ',', 'oder', '.']);
	});
});
