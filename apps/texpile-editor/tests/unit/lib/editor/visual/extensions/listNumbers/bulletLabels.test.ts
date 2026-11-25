import { describe, expect, it } from 'vitest';
import { itemLabelsWithBullets, MARKDOWN_BULLETS, TYPST_BULLETS } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('bullet labels by depth (A14)', () => {
	it('gives a Markdown item at depth 2 a circle', () => {
		const { doc } = parseMarkdownFile('- a\n  - b\n    - c\n');
		expect([...itemLabelsWithBullets(MARKDOWN_BULLETS)(doc).values()]).toEqual(['•', '◦', '▪']);
	});

	it('gives a Typst item at depth 2 the triangular bullet', () => {
		const { doc } = parseTypstFile('- a\n  - b\n    - c\n');
		expect([...itemLabelsWithBullets(TYPST_BULLETS)(doc).values()]).toEqual(['•', '‣', '–']);
	});
});
