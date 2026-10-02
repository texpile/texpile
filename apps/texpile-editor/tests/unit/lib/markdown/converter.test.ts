import { describe, it, expect } from 'vitest';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { blockSpanOf } from '$lib/editor/visual/sourceSpans';

const names = (doc: ReturnType<typeof markdownToProseMirror>['doc']) => {
	const out: string[] = [];
	doc.forEach((c) => out.push(c.type.name));
	return out;
};

describe('markdownToProseMirror', () => {
	it('parses core blocks', () => {
		const { doc } = markdownToProseMirror('# Title\n\nHello *world* **bold** `code`.\n\n---\n\n> quoted\n');
		expect(names(doc)).toEqual(['heading', 'paragraph', 'horizontal_rule', 'blockquote']);
		expect(doc.child(0).attrs.level).toBe(1);
		const para = doc.child(1);
		expect(para.textContent).toBe('Hello world bold code.');
		expect(doc.child(3).child(0).type.name).toBe('paragraph');
	});

	it('notes block spans that tile the source', () => {
		const src = '# Title\n\nSecond paragraph.\n\nThird.\n';
		const { doc } = markdownToProseMirror(src);
		const spans: { srcFrom: number; srcTo: number }[] = [];
		doc.forEach((c) => spans.push(blockSpanOf(c)!));
		expect(spans.map((s) => src.slice(s.srcFrom, s.srcTo))).toEqual(['# Title', 'Second paragraph.', 'Third.']);
		// the gaps between the spans are the bytes the blocks are not: whitespace only
		let end = 0;
		for (const s of spans) {
			expect(src.slice(end, s.srcFrom).trim()).toBe('');
			end = s.srcTo;
		}
		expect(src.slice(end).trim()).toBe('');
	});

	it('lists become one flat-list node per item under one span', () => {
		const { doc } = markdownToProseMirror('- alpha\n- beta\n- gamma\n');
		expect(names(doc)).toEqual(['list', 'list', 'list']);
		expect(blockSpanOf(doc.child(0))?.size).toBe(3);
		expect(blockSpanOf(doc.child(2))).toBeUndefined();
		expect(doc.child(0).attrs.kind).toBe('bullet');
	});

	it('ordered list start number lands on the first node only', () => {
		const { doc } = markdownToProseMirror('3. three\n4. four\n');
		expect(doc.child(0).attrs.order).toBe(3);
		expect(doc.child(1).attrs.order).toBe(1);
	});

	it('task items map to kind task with checked', () => {
		const { doc } = markdownToProseMirror('- [x] done\n- [ ] todo\n');
		expect(doc.child(0).attrs.kind).toBe('task');
		expect(doc.child(0).attrs.checked).toBe(true);
		expect(doc.child(1).attrs.checked).toBe(false);
		expect(doc.child(0).textContent).toBe('done');
	});

	it('fences keep info string and content', () => {
		const { doc } = markdownToProseMirror('```js\nconst x = 1;\n```\n');
		const cb = doc.child(0);
		expect(cb.type.name).toBe('code_block');
		expect(cb.attrs.args).toBe('js');
		expect(cb.attrs.env).toBe('fence');
		expect(cb.textContent).toBe('const x = 1;');
	});

	it('html blocks and inline html become raw nodes with lang html', () => {
		const { doc } = markdownToProseMirror('<div class="x">\nraw\n</div>\n\ntext <kbd>K</kbd> after\n');
		expect(doc.child(0).type.name).toBe('raw_latex');
		expect(doc.child(0).attrs.lang).toBe('html');
		const para = doc.child(1);
		const kinds: string[] = [];
		para.forEach((c) => kinds.push(c.type.name));
		expect(kinds).toContain('inline_latex');
		expect(para.textContent).toContain('after');
	});

	it('math becomes inline_math / block_math', () => {
		const { doc } = markdownToProseMirror('Euler: $e^{i\\pi} = -1$.\n\n$$\nE = mc^2\n$$\n');
		const para = doc.child(0);
		let sawInline = false;
		para.forEach((c) => {
			if (c.type.name === 'inline_math') sawInline = true;
		});
		expect(sawInline).toBe(true);
		expect(doc.child(1).type.name).toBe('block_math');
		expect(doc.child(1).textContent).toBe('E = mc^2');
	});

	it('a $ that is not math stays literal text', () => {
		const { doc } = markdownToProseMirror('It costs $5 and $ 10.\n');
		expect(doc.child(0).textContent).toBe('It costs $5 and $ 10.');
	});

	it('GFM table maps to prosemirror-tables with alignment colspec', () => {
		const { doc } = markdownToProseMirror('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
		const table = doc.child(0);
		expect(table.type.name).toBe('table');
		expect(table.attrs.colspec).toBe(':---|---:');
		expect(table.child(0).child(0).type.name).toBe('table_header');
		expect(table.child(1).child(0).type.name).toBe('table_cell');
		expect(table.child(1).child(1).textContent).toBe('2');
	});

	it('sole-image paragraph becomes a block figure; mixed image stays a chip', () => {
		const { doc } = markdownToProseMirror('![cat](img/cat.png "A cat")\n\nsee ![icon](i.png) here\n');
		expect(doc.child(0).type.name).toBe('image');
		expect(doc.child(0).attrs.src).toBe('img/cat.png');
		expect(doc.child(0).textContent).toBe('A cat');
		let chip: string | null = null;
		doc.child(1).forEach((c) => {
			if (c.type.name === 'inline_latex') chip = c.textContent;
		});
		expect(chip).toBe('![icon](i.png)');
	});

	// markdown-it normalizes every destination through mdurl.encode, which is right for an <img
	// src> and wrong for a path we resolve on disk and write back to the .md: an image called
	// 图片.png arrived as %E5%9B%BE%E7%89%87.png, never loaded, and got saved that way.
	it('keeps image/link destinations as the author wrote them', () => {
		const { doc } = markdownToProseMirror(
			'![a](images/图片.png)\n\n![b](<my file.png>)\n\n![c](images/my%20file.png)\n\n![d](100%.png)\n\n![e](https://x.example/i.png?w=2&h=1#frag)\n\n[f](docs/café.md)\n'
		);
		expect(doc.child(0).attrs.src).toBe('images/图片.png');
		expect(doc.child(1).attrs.src).toBe('my file.png');
		// an escaped destination decodes to the real filename; the file on disk has the space
		expect(doc.child(2).attrs.src).toBe('images/my file.png');
		// a literal % is not valid escaping - decoding throws, so the raw text is already the path
		expect(doc.child(3).attrs.src).toBe('100%.png');
		// decodeURI, not decodeURIComponent: query and fragment separators stay separators
		expect(doc.child(4).attrs.src).toBe('https://x.example/i.png?w=2&h=1#frag');
		let href: string | null = null;
		doc.child(5).forEach((c) => {
			const link = c.marks.find((m) => m.type.name === 'link');
			if (link) href = String(link.attrs.href);
		});
		expect(href).toBe('docs/café.md');
	});

	it('keeps the escapes a link’s URL was written with', () => {
		const { doc } = markdownToProseMirror('[a](https://x.com/100%25-guide) [b](https://x.com/a%20b#c)\n');
		const hrefs: string[] = [];
		doc.descendants((node) => {
			const link = node.marks.find((mark) => mark.type.name === 'link');
			if (link && !hrefs.includes(link.attrs.href)) hrefs.push(link.attrs.href);
		});
		expect(hrefs).toEqual(['https://x.com/100%25-guide', 'https://x.com/a%20b#c']);
	});

	it('links carry href/title and autolinks are bare', () => {
		const { doc } = markdownToProseMirror('[x](https://a.example "T") and <https://b.example>\n');
		const para = doc.child(0);
		const links: { href: string; bare: boolean }[] = [];
		para.forEach((c) => {
			const m = c.marks.find((mk) => mk.type.name === 'link');
			if (m) links.push({ href: m.attrs.href, bare: m.attrs.bare });
		});
		expect(links[0]).toEqual({ href: 'https://a.example', bare: false });
		expect(links[1]).toEqual({ href: 'https://b.example', bare: true });
	});

	it('empty input yields a single empty paragraph', () => {
		const { doc } = markdownToProseMirror('');
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('paragraph');
	});

	it('doc passes schema validation', () => {
		const { doc } = markdownToProseMirror(
			'# H\n\npara ~~gone~~ [l](u)\n\n- a\n  - nested\n- [ ] task\n\n| a |\n|---|\n| 1 |\n\n```\ncode\n```\n\n> q\n\n$$x$$\n'
		);
		expect(() => doc.check()).not.toThrow();
	});
});
