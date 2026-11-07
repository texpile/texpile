import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { gen, regen } from './mdTestUtils';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';

/** the text of each run that is a link, with its href and how it was written */
function links(src: string): { text: string; href: string; bare: unknown }[] {
	const out: { text: string; href: string; bare: unknown }[] = [];
	markdownToProseMirror(src).doc.descendants((node: Node) => {
		const link = node.marks.find((m) => m.type.name === 'link');
		if (link && node.isText) out.push({ text: node.text!, href: link.attrs.href, bare: link.attrs.bare });
	});
	return out;
}

describe('URLs written in text', () => {
	// GitHub makes a link of a bare URL, and a regenerated paragraph writes it as it was
	it('are links, without the punctuation that ends the sentence', () => {
		expect(links('See https://x.example/a_b, and (www.y.example) or "https://z.example".\n')).toEqual([
			{ text: 'https://x.example/a_b', href: 'https://x.example/a_b', bare: 'literal' },
			{ text: 'www.y.example', href: 'http://www.y.example', bare: 'literal' },
			{ text: 'https://z.example', href: 'https://z.example', bare: 'literal' }
		]);
		const src = 'See https://x.example/a_b, and (www.y.example) or "https://z.example".\n';
		expect(gen(src)).toBe(src.trim());
		expect(regen(src)).toBe(gen(src));
	});

	it('stop before the backslash of a hard break', () => {
		const src = 'Author: https://x.example/a\\\nNext\n';
		expect(links(src)[0].text).toBe('https://x.example/a');
		expect(gen(src)).toBe('Author: https://x.example/a\\\nNext');
	});

	it('are written as links where the text beside them would join them', () => {
		expect(links('[a](u) and a@b.example\n').map((l) => l.href)).toEqual(['u', 'mailto:a@b.example']);
		expect(gen('x [https://x.example] y\n')).toBe('x \\[[https://x.example](https://x.example)\\] y');
	});

	it('are no links inside the text of one', () => {
		expect(links('[see https://x.example](https://y.example)\n')).toEqual([
			{ text: 'see https://x.example', href: 'https://y.example', bare: false }
		]);
	});
});
