import { describe, it, expect } from 'vitest';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { serializeToMarkdown } from '$lib/languages/markdown/visual/serialize/serializer';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';

/** the no-edit save: parse then serialize, nothing touched. */
function roundtrip(src: string): string {
	const parsed = parseMarkdownFile(src);
	return serializeMarkdownFile(parsed, parsed.doc);
}

const CORPUS: Record<string, string> = {
	basic: '# Title\n\nA paragraph with *em*, **strong**, `code`, and [a link](https://x.example).\n',
	frontmatter: '---\ntitle: My Doc\ntags: [a, b]\n---\n\n# Body\n\nText.\n',
	lists: '- one\n- two\n  - nested\n- three\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo\n',
	oddSpacing: '#   Heading with spaces   \n\n\nText after two blanks.\n\n\n\nMore.\n',
	fenced: 'Before\n\n```python\ndef f():\n    return 1\n```\n\nAfter\n',
	table: '| Col A | Col B |\n|:------|------:|\n| 1     | 2     |\n| 3     | 4     |\n',
	html: '<div align="center">\n  <b>centered</b>\n</div>\n\nInline <kbd>Ctrl</kbd> here.\n',
	math: 'Inline $a^2 + b^2 = c^2$ math.\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n',
	quote: '> level one\n>\n> > nested\n\ndone\n',
	setext: 'Setext Title\n============\n\nBody.\n',
	hardWrap: 'This paragraph is wrapped\nacross several lines\nin the source.\n',
	images: '![cat](cat.png "A cat")\n\ntext with ![inline](i.png) image\n',
	// the shapes a real README opens with: badges are link-wrapped images, logos are centred HTML
	badges:
		'[![Build](https://img.shields.io/b.svg)](https://ci.example)\n[![Docs](d.svg)](https://d.example)\n\n<p align="center">\n  <img src="logo.png" width="200">\n</p>\n',
	// a path we look up on disk must survive verbatim, not percent-encoded
	nonAsciiPaths: '![图](images/图片.png)\n\n![cafe](images/café.png)\n\n[doc](docs/图片.md)\n',
	spacedPaths: '![a](<my file.png>)\n\n![b](images/my%20file.png)\n',
	underscores: 'snake_case_word stays, *real em*, 5 * 3 = 15.\n',
	refLinks: '[text][ref] here\n\n[ref]: https://ref.example\n',
	noTrailingNewline: '# No trailing newline',
	crlfIsh: 'para one\n\npara two\n'
};

describe('markdown no-edit save is byte-identical', () => {
	for (const [name, src] of Object.entries(CORPUS)) {
		it(name, () => {
			expect(roundtrip(src)).toBe(src);
		});
	}
});

describe('regeneration reaches a fixed point', () => {
	// strip orig stamps by regenerating: serialize the parsed doc WITHOUT verbatim data, then
	// re-parse and re-serialize; the second pass must not drift (no compounding churn)
	for (const [name, src] of Object.entries(CORPUS)) {
		it(name, () => {
			const { doc } = markdownToProseMirror(src.replace(/^---[\s\S]*?---\n/, ''));
			const gen1 = serializeToMarkdown(doc);
			const gen2 = serializeToMarkdown(markdownToProseMirror(gen1).doc);
			expect(gen2).toBe(gen1);
		});
	}
});

describe('an edit regenerates only its block', () => {
	it('editing the middle paragraph leaves neighbours byte-identical', () => {
		const src = '# Title\n\nfirst   paragraph\n\nsecond   paragraph\n\nthird   paragraph\n';
		const parsed = parseMarkdownFile(src);
		const doc = parsed.doc;
		// replace paragraph 2's text ("second   paragraph" is child index 2)
		const target = doc.child(2);
		const replaced = target.type.create({ ...target.attrs }, doc.type.schema.text('EDITED'), target.marks);
		const kids = [];
		for (let i = 0; i < doc.childCount; i++) kids.push(i === 2 ? replaced : doc.child(i));
		const edited = doc.copy(doc.type.schema.nodes.doc.create(null, kids).content);
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('first   paragraph'); // verbatim neighbours keep odd spacing
		expect(out).toContain('third   paragraph');
		expect(out).toContain('EDITED');
		expect(out).not.toContain('second');
	});
});

describe('markdown serializer output', () => {
	const gen = (src: string) => serializeToMarkdown(markdownToProseMirror(src).doc);

	it('regenerates canonical constructs', () => {
		expect(gen('Alt Heading\n===========\n')).toBe('# Alt Heading');
		// bullet markers and ordered delimiters are kept: they are what keeps adjacent lists apart
		expect(gen('* star bullet\n')).toBe('* star bullet');
		expect(gen('3) paren ordered\n')).toBe('3) paren ordered');
	});

	it('escapes structure characters in prose', () => {
		const out = gen('para\n');
		expect(out).toBe('para');
		const { doc } = markdownToProseMirror('x\n');
		const schema = doc.type.schema;
		const p = schema.nodes.paragraph.create(null, schema.text('*not em* [not link] # not heading'));
		const d = schema.nodes.doc.create(null, [p]);
		const s = serializeToMarkdown(d);
		expect(markdownToProseMirror(s).doc.child(0).textContent).toBe('*not em* [not link] # not heading');
	});

	it('emphasis delimiters never touch whitespace', () => {
		const { doc } = markdownToProseMirror('x\n');
		const schema = doc.type.schema;
		const strong = schema.marks.strong.create();
		const p = schema.nodes.paragraph.create(null, [schema.text('a'), schema.text(' padded ', [strong]), schema.text('b')]);
		const s = serializeToMarkdown(schema.nodes.doc.create(null, [p]));
		expect(s).toBe('a **padded** b');
	});

	it('nested marks close and reopen minimally', () => {
		const src = '**bold *both* bold**\n';
		expect(gen(src)).toBe('**bold *both* bold**');
	});

	it('tight lists stay tight through regeneration', () => {
		expect(gen('- a\n- b\n- c\n')).toBe('- a\n- b\n- c');
	});

	it('table regenerates with alignment', () => {
		const out = gen('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
		expect(out).toBe('| a | b |\n| :--- | ---: |\n| 1 | 2 |');
	});

	it('code fences grow past embedded backtick runs', () => {
		const out = gen('````\ncode with ``` inside\n````\n');
		expect(out.startsWith('````')).toBe(true);
		expect(markdownToProseMirror(out).doc.child(0).textContent).toBe('code with ``` inside');
	});
});
