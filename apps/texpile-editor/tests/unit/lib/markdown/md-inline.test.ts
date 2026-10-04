import { describe, it, expect } from 'vitest';
import { gen, regen, docOf, para } from './mdTestUtils';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { serializeToMarkdown } from '$lib/languages/markdown/visual/serializer';

describe('inline constructs', () => {
	// M12
	it('an inline image keeps a destination with spaces or parens', () => {
		const src = 'see ![j](<my file.png>) and ![k](i%20mg.png "t") and ![p](a(1).png) x\n';
		expect(gen(src)).toBe('see ![j](<my file.png>) and ![k](<i mg.png> "t") and ![p](<a(1).png>) x');
		const kinds: string[] = [];
		markdownToProseMirror(gen(src))
			.doc.child(0)
			.forEach((c) => kinds.push(c.type.name));
		expect(kinds.filter((k) => k === 'inline_latex')).toHaveLength(3);
	});

	// M14
	it('image alt text is escaped once, not once per save', () => {
		const src = '![a \\[b\\] c\\\\d](x.png)\n';
		expect(markdownToProseMirror(src).doc.child(0).attrs.alt).toBe('a [b] c\\d');
		expect(gen(src)).toBe('![a \\[b\\] c\\\\d](x.png)');
		expect(regen(src)).toBe(gen(src));
	});

	// M15
	it('a code span keeps its edge spaces', () => {
		expect(gen('`  a  `\n')).toBe('`  a  `');
		expect(gen('` a` and `a `\n')).toBe('` a` and `a `');
		// a span of nothing but spaces is read whole, so it is written back unpadded and stays that size
		expect(gen('`   `\n')).toBe('`   `');
		expect(regen('`   `\n')).toBe('`   `');
	});

	// M22
	it('a link with empty text stays in the file', () => {
		expect(gen('[](u)\n\nnext\n')).toBe('[](u)\n\nnext');
	});

	// M24
	it('nested marks reopen only the inner one', () => {
		expect(gen('*em **nested strong** em*\n')).toBe('*em **nested strong** em*');
	});

	// M29
	it('a hidden caption is still written as the title', () => {
		const img = mdSchema.nodes.image.create({ src: 'x.png', alt: 'a', showCaption: false }, mdSchema.text('The caption'));
		expect(serializeToMarkdown(docOf(img))).toBe('![a](x.png "The caption")');
	});

	// M32
	it('a bare link keeps its title, and an href its newline', () => {
		const titled = mdSchema.marks.link.create({ href: 'https://x', title: 'T', bare: true });
		expect(serializeToMarkdown(docOf(para(mdSchema.text('https://x', [titled]))))).toBe('[https://x](https://x "T")');
		const broken = mdSchema.marks.link.create({ href: 'a\nb' });
		const out = serializeToMarkdown(docOf(para(mdSchema.text('l', [broken]))));
		expect(out).toBe('[l](a%0Ab)');
		let href = '';
		markdownToProseMirror(out)
			.doc.child(0)
			.forEach((c) => c.marks.forEach((m) => (href = String(m.attrs.href))));
		expect(href).toBe('a\nb');
	});
});
