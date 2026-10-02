import { describe, it, expect } from 'vitest';
import { Fragment, type Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { padTables } from '$lib/editor/visual/padTables';
import { parseMarkdownFile, serializeMarkdownFile, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { pmToSource } from '$lib/editor/visual/sourceSpans';

// what an edit in the visual editor leaves of a markdown file: everything but the bytes of what
// changed, inside a list item or a quote as at the top level, hand wraps and prefixes included

const MD = `# Title



Intro paragraph wrapped
by hand here.

- first item wrapped
  by hand too
- second item with *emph* and
  a wrap
  - nested child
  - nested other

> quoted line one
> quoted line two
> continues here

1. one
2. two

Tail paragraph.
`;

/** the block at `path`, its first text leaf retyped */
function retype(doc: Node, path: number[], fn: (t: string) => string): Node {
	function go(node: Node, depth: number): Node {
		const kids: Node[] = [];
		if (depth === path.length) {
			let done = false;
			node.forEach((c) => {
				if (!done && c.isText) {
					kids.push(c.type.schema.text(fn(c.text!), c.marks));
					done = true;
				} else kids.push(c);
			});
		} else node.forEach((c, _o, i) => kids.push(i === path[depth] ? go(c, depth + 1) : c));
		return node.type.create(node.attrs, Fragment.fromArray(kids), node.marks);
	}
	return go(doc, 0);
}

/** the block at `path` replaced by `make(schema)` */
function replace(doc: Node, path: number[], make: (node: Node) => Node): Node {
	function go(node: Node, depth: number): Node {
		if (depth === path.length) return make(node);
		const kids: Node[] = [];
		node.forEach((c, _o, i) => kids.push(i === path[depth] ? go(c, depth + 1) : c));
		return node.type.create(node.attrs, Fragment.fromArray(kids), node.marks);
	}
	return go(doc, 0);
}

function bold(doc: Node, path: number[], word: string): Node {
	return replace(doc, path, (node) => {
		const kids: Node[] = [];
		node.forEach((c) => {
			const at = c.isText ? c.text!.indexOf(word) : -1;
			if (at < 0) return kids.push(c);
			const t = c.text!;
			if (at > 0) kids.push(c.type.schema.text(t.slice(0, at), c.marks));
			kids.push(c.type.schema.text(word, [...c.marks, c.type.schema.marks.strong.create()]));
			if (at + word.length < t.length) kids.push(c.type.schema.text(t.slice(at + word.length), c.marks));
		});
		return node.type.create(node.attrs, Fragment.fromArray(kids), node.marks);
	});
}

function posOf(doc: Node, needle: string): number {
	let found = -1;
	doc.descendants((n, pos) => {
		if (found >= 0 || !n.isText) return found < 0;
		const at = n.text!.indexOf(needle);
		if (at >= 0) found = pos + at;
		return false;
	});
	if (found < 0) throw new Error(`no ${needle}`);
	return found;
}

// Markdown is kept at block granularity (see serializer.ts): a block that changed in more than
// plain text is written whole, wrapped as the file wrapped it, and every other block, at the top
// level or inside an item or a quote, is the file's bytes
describe('markdown: an edit keeps every block but its own', () => {
	const parsed = parseMarkdownFile(MD);

	it('untouched, the file is byte-identical', () => {
		expect(serializeMarkdownFile(parsed, parsed.doc)).toBe(MD);
	});

	it('a word typed in a wrapped paragraph writes the paragraph whole at the file\u2019s width, the three blank lines above it kept', () => {
		expect(
			serializeMarkdownFile(
				parsed,
				retype(parsed.doc, [1], (t) => 'EDITED ' + t)
			)
		).toBe(MD.replace('Intro paragraph wrapped\nby hand here.', 'EDITED Intro paragraph\nwrapped by hand here.'));
	});

	it('a word made bold writes its paragraph whole, wrapped as it was', () => {
		expect(serializeMarkdownFile(parsed, bold(parsed.doc, [1], 'hand'))).toBe(MD.replace('by hand here', 'by **hand** here'));
	});

	it('an item retyped leaves the other items, their wraps and the nested list as they were', () => {
		expect(
			serializeMarkdownFile(
				parsed,
				retype(parsed.doc, [3, 0], (t) => t.replace('second', 'SECOND'))
			)
		).toBe(MD.replace('second', 'SECOND'));
	});

	it('a nested item retyped leaves everything around it', () => {
		expect(
			serializeMarkdownFile(
				parsed,
				retype(parsed.doc, [3, 2, 0], (t) => t.replace('other', 'OTHER'))
			)
		).toBe(MD.replace('nested other', 'nested OTHER'));
	});

	it('a quoted paragraph retyped is written whole under its markers, wrapped as it was', () => {
		expect(
			serializeMarkdownFile(
				parsed,
				retype(parsed.doc, [4, 0], (t) => t.replace('two', 'TWO'))
			)
		).toBe(MD.replace('line two', 'line TWO'));
	});

	it('an ordered item retyped keeps its number and its neighbour', () => {
		expect(
			serializeMarkdownFile(
				parsed,
				retype(parsed.doc, [6, 0], () => 'TWO')
			)
		).toBe(MD.replace('2. two', '2. TWO'));
	});

	it('a paragraph written afresh inside an item continues under the marker', () => {
		const schema = parsed.doc.type.schema;
		const edited = replace(parsed.doc, [3, 2, 0], (p) =>
			p.type.create(
				p.attrs,
				Fragment.fromArray([schema.text('one line'), schema.nodes.hard_break.create(), schema.text('next line')]),
				p.marks
			)
		);
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('  - nested child\n  - one line\\\n    next line\n');
		expect(out).toContain('- first item wrapped\n  by hand too\n');
	});

	it('maps the kept bytes and the fresh ones of an edited item', () => {
		const edited = retype(parsed.doc, [3, 0], (t) => t.replace('second', 'SECOND'));
		const { text, map } = serializeMarkdownFileDetailed(parsed, edited);
		for (const word of ['Intro', 'first', 'SECOND', 'wrap', 'nested', 'quoted', 'Tail']) {
			const off = pmToSource(map.leaves, posOf(edited, word) + 1);
			expect(off, word).not.toBeNull();
			expect(text.slice(off! - 1, off! - 1 + word.length)).toBe(word);
		}
	});
});

describe('markdown: a block dragged elsewhere brings its bytes along', () => {
	const DRAG =
		'First paragraph wrapped\nby hand.\n\n- one wrapped\n  by hand\n- two\n- three\n\n> quote one wrapped\n> by hand\n>\n> quote two\n\nLast paragraph wrapped\nby hand.\n';

	/** the child at `from` of the node at `path` dragged to index `to`: the nodes themselves kept, as a drag keeps them */
	function move(doc: Node, path: number[], from: number, to: number): Node {
		function go(node: Node, depth: number): Node {
			const kids: Node[] = [];
			if (depth === path.length) {
				node.forEach((c) => kids.push(c));
				const [m] = kids.splice(from, 1);
				kids.splice(to, 0, m);
			} else node.forEach((c, _o, i) => kids.push(i === path[depth] ? go(c, depth + 1) : c));
			return node.type.create(node.attrs, Fragment.fromArray(kids), node.marks);
		}
		return go(doc, 0);
	}

	it('a paragraph dragged to the top keeps its wrap and leaves the rest as written', () => {
		const parsed = parseMarkdownFile(DRAG);
		expect(serializeMarkdownFile(parsed, move(parsed.doc, [], 5, 0))).toBe(
			'Last paragraph wrapped\nby hand.\n\n' + DRAG.replace('\n\nLast paragraph wrapped\nby hand.\n', '\n')
		);
	});

	it('an item dragged before the others keeps every item as written, in the new order', () => {
		const parsed = parseMarkdownFile(DRAG);
		expect(serializeMarkdownFile(parsed, move(parsed.doc, [], 3, 1))).toBe(
			DRAG.replace('- one wrapped\n  by hand\n- two\n- three', '- three\n- one wrapped\n  by hand\n- two')
		);
	});

	it('a paragraph dragged above another inside a quote keeps both as written', () => {
		const parsed = parseMarkdownFile(DRAG);
		expect(serializeMarkdownFile(parsed, move(parsed.doc, [4], 1, 0))).toBe(
			DRAG.replace('> quote one wrapped\n> by hand\n>\n> quote two', '> quote two\n>\n> quote one wrapped\n> by hand')
		);
	});
});

describe('markdown: a nested quote regenerated inside its quote keeps one marker per level', () => {
	const QUOTES = '> A single-level quote.\n>\n> > And a nested quote inside it.\n> > Continued here.\n\nAfter.\n';

	it('a paragraph split inside the nested quote writes the nested lines with two markers, not three', () => {
		const parsed = parseMarkdownFile(QUOTES);
		const inner = parsed.doc.child(0).child(1);
		expect(inner.type.name).toBe('blockquote');
		const para = inner.child(0);
		const schema = parsed.doc.type.schema;
		// the paragraph split in two: the nested quote regenerates, its own > is its first byte
		const a = schema.nodes.paragraph.create(null, schema.text('And a nested'));
		const b = schema.nodes.paragraph.create(null, schema.text('quote inside it. Continued here.'));
		const edited = replace(parsed.doc, [0, 1], (q) => q.type.create(q.attrs, Fragment.fromArray([a, b]), q.marks));
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('> A single-level quote.\n>\n> > And a nested\n> >\n> > quote inside it. Continued here.\n');
		expect(out).not.toContain('> > >');
		void para;
	});
});

describe('markdown: a child added to an item leaves the other items as written', () => {
	const LIST = 'Intro.\n\n- one wrapped\n  by hand\n- two wrapped\n  by hand\n- three\n\nAfter.\n';

	it('a paragraph added to the second item keeps the first and third as written, the list tight', () => {
		const parsed = parseMarkdownFile(LIST);
		const schema = parsed.doc.type.schema;
		const fresh = schema.nodes.paragraph.create(null, schema.text('More here.'));
		const edited = replace(parsed.doc, [2], (it) => it.type.create(it.attrs, Fragment.fromArray([it.child(0), fresh]), it.marks));
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('- one wrapped\n  by hand\n- two wrapped\n  by hand\n\n  More here.\n- three\n');
	});

	it('the second item split in two keeps the first and third as written', () => {
		const parsed = parseMarkdownFile(LIST);
		const item = parsed.doc.child(2);
		const schema = parsed.doc.type.schema;
		const a = schema.nodes.paragraph.create(null, schema.text('two'));
		const b = schema.nodes.paragraph.create(null, schema.text('wrapped by hand'));
		const edited = replace(parsed.doc, [2], (it) => it.type.create(it.attrs, Fragment.fromArray([a, b]), it.marks));
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('- one wrapped\n  by hand\n- two\n\n  wrapped by hand\n- three\n');
		void item;
	});
});

describe('markdown: prose written afresh into an item is set off by a blank line', () => {
	const NESTED = '# Lists\n\n- A bullet.\n- Another bullet.\n  - Nested.\n    - Deeper.\n- Last.\n';

	it('an item paragraph split above its nested list gets a blank line, not a lazy continuation', () => {
		const parsed = parseMarkdownFile(NESTED);
		const schema = parsed.doc.type.schema;
		const a = schema.nodes.paragraph.create(null, schema.text('Another'));
		const b = schema.nodes.paragraph.create(null, schema.text('bullet.'));
		const edited = replace(parsed.doc, [2], (it) => it.type.create(it.attrs, Fragment.fromArray([a, b, it.child(1)]), it.marks));
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('- A bullet.\n- Another\n\n  bullet.\n  - Nested.\n    - Deeper.\n- Last.\n');
		const again = parseMarkdownFile(out).doc.child(2);
		expect(again.childCount).toBe(3);
		expect(again.child(1).textContent).toBe('bullet.');
	});

	it('a paragraph added below the nested list gets a blank line too', () => {
		const parsed = parseMarkdownFile(NESTED);
		const schema = parsed.doc.type.schema;
		const fresh = schema.nodes.paragraph.create(null, schema.text('After the nest.'));
		const edited = replace(parsed.doc, [2], (it) =>
			it.type.create(it.attrs, Fragment.fromArray([it.child(0), it.child(1), fresh]), it.marks)
		);
		const out = serializeMarkdownFile(parsed, edited);
		expect(out).toContain('- Another bullet.\n  - Nested.\n    - Deeper.\n\n  After the nest.\n- Last.\n');
		expect(parseMarkdownFile(out).doc.child(2).child(2).textContent).toBe('After the nest.');
	});
});

describe('markdown: a block joined onto the one before it', () => {
	const JOINED = 'Intro text with `tlmgr`.\n\n[a link](https://www.example.com) after it.\n';

	it('keeps the closing delimiter of a code span the join reaches back to', () => {
		const parsed = parseMarkdownFile(JOINED);
		const first = parsed.doc.child(0);
		const kids: Node[] = [];
		first.forEach((c) => kids.push(c));
		parsed.doc.child(1).forEach((c) => kids.push(c));
		const joined = parsed.doc.type.create(
			parsed.doc.attrs,
			Fragment.fromArray([first.type.create(first.attrs, Fragment.fromArray(kids), first.marks)]),
			parsed.doc.marks
		);
		expect(serializeMarkdownFile(parsed, joined)).toContain('`tlmgr`.[a link](');
	});
});

describe('the bytes beside a change stay readable', () => {
	it('typing after an entity writes the paragraph whole, the entities as the dialect escapes them', () => {
		const src = 'Entities: &amp; &lt; end.\n';
		const parsed = parseMarkdownFile(src);
		const at = posOf(parsed.doc, '&') + 1;
		const doc = new Transform(parsed.doc).replaceWith(at, at, parsed.doc.type.schema.text(',# é')).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('Entities: &,# é \\< end.\n');
		expect(parseMarkdownFile(out).doc.toString()).toBe(doc.toString());
	});

	it('a deletion that would leave an emphasis opening after a letter writes the run afresh, the punctuation outside', () => {
		for (const src of ['Op*en any .typ* file\n', '| A | B |\n| --- | --- |\n| x | Op*en any .typ* file |\n']) {
			const parsed = parseMarkdownFile(src);
			const opened = padTables(parsed.doc);
			const from = posOf(opened, 'Op') + 1;
			const to = posOf(opened, 'en any .typ') + 'en any '.length;
			const doc = new Transform(opened).delete(from, to).doc;
			const out = serializeMarkdownFile(parsed, doc);
			expect(out).toBe(src.replace('Op*en any .typ*', 'O.*typ*'));
			expect(parseMarkdownFile(out).doc.textContent).toBe(doc.textContent);
		}
	});

	it('an item paragraph split at its start keeps the item one, the empty half written as nothing', () => {
		const src = '## Settings\n\n- [Themes](themes.md)\n- [Markdown](markdown.md)\n';
		const parsed = parseMarkdownFile(src);
		const doc = new Transform(parsed.doc).split(posOf(parsed.doc, 'Themes')).doc;
		expect(doc.child(1).childCount).toBe(2);
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe(src);
	});
});

describe('emphasis beside a link', () => {
	it('strong reaching out of a link reopens after the link, not inside the word after it', () => {
		const src = '- [the shared bibliography](../latex/refs.bib)A short checklist\n';
		const parsed = parseMarkdownFile(src);
		const s = parsed.doc.type.schema;
		const from = posOf(parsed.doc, 'shared');
		const to = posOf(parsed.doc, 'A short ') + 'A short '.length;
		const doc = new Transform(parsed.doc).addMark(from, to, s.marks.strong.create()).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('- [the **shared bibliography**](../latex/refs.bib)**A short** checklist\n');
		const again = parseMarkdownFile(out).doc;
		expect(again.textContent).toBe(doc.textContent);
		expect(again.toString()).toContain('link(strong("shared bibliography")), strong("A short"), " checklist"');
	});

	it('strong over an autolink wraps its angle brackets', () => {
		const src = 'a URL with parentheses <https://en.wikipedia.org/wiki/Bracket_(disambiguation)>, an underscore\n';
		const parsed = parseMarkdownFile(src);
		const s = parsed.doc.type.schema;
		const from = posOf(parsed.doc, 'parentheses');
		const to = posOf(parsed.doc, ', an') + 4;
		const doc = new Transform(parsed.doc).addMark(from, to, s.marks.strong.create()).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('a URL with **parentheses <https://en.wikipedia.org/wiki/Bracket_(disambiguation)>, an** underscore\n');
		expect(parseMarkdownFile(out).doc.toString()).toBe(doc.toString());
	});
});

describe('a marker typed at the start of a line', () => {
	it('after a hard break, the marker is escaped so it does not open a list', () => {
		const src = 'A backslash break works too\\\nlike this, not.\n';
		const parsed = parseMarkdownFile(src);
		const at = posOf(parsed.doc, 'like this');
		const doc = new Transform(parsed.doc).replaceWith(at, at, parsed.doc.type.schema.text('+ ')).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('A backslash break works too\\\n\\+ like this, not.\n');
		expect(parseMarkdownFile(out).doc.toString()).toBe(doc.toString());
	});
});

describe('a delimiter that a seam would leave unable to flank', () => {
	it('emphasis widened to take in a leading space is written afresh, the space outside', () => {
		const src = '## With ap*t*\n\nText.\n';
		const parsed = parseMarkdownFile(src);
		const s = parsed.doc.type.schema;
		const from = posOf(parsed.doc, ' ap');
		const doc = new Transform(parsed.doc).addMark(from, from + 4, s.marks.em.create()).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('## With *apt*\n\nText.\n');
		expect(parseMarkdownFile(out).doc.child(0).toString()).toBe('heading("With ", em("apt"))');
	});

	it('a space typed before a closing star in a table cell is moved out of the emphasis', () => {
		const src = '| a | b |\n| --- | --- |\n| `*x*` | *x* |\n';
		const parsed = parseMarkdownFile(src);
		const doc0 = padTables(parsed.doc);
		// the emphasised x, not the one in the code span
		let at = -1;
		doc0.descendants((n, pos) => {
			if (at < 0 && n.isText && n.marks.some((m) => m.type.name === 'em')) at = pos + 1;
			return at < 0;
		});
		const doc = new Transform(doc0).replaceWith(at, at, doc0.type.schema.text('- ', doc0.resolve(at).marks())).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe('| a | b |\n| --- | --- |\n| `*x*` | *x-* |\n');
	});
});

// written whole, the paragraph would come back respelled by the deterministic rules
describe('a word retyped in plain text keeps the rest of its paragraph as written', () => {
	it.each([
		'See [the docs][docs] for more today.\n\n[docs]: https://example.com\n',
		'Fish &amp; chips &copy; 2020 today.\n',
		'Some _emphasised_ and __strong__ words today.\n',
		'A verse  \nends today.\n'
	])('%j', (src) => {
		const parsed = parseMarkdownFile(src);
		const at = posOf(parsed.doc, 'today') + 2;
		const doc = new Transform(parsed.doc).replaceWith(at, at, parsed.doc.type.schema.text('X')).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(out).toBe(src.replace('today', 'toXday'));
		expect(parseMarkdownFile(out).doc.toString()).toBe(doc.toString());
	});

	it('writes the paragraph whole where the seam would read as markup', () => {
		// a dot after the digit starting a line would make it a list's number
		const src = 'A line wrapped by hand\n1 more line.\n';
		const parsed = parseMarkdownFile(src);
		const at = posOf(parsed.doc, '1 more') + 1;
		const doc = new Transform(parsed.doc).replaceWith(at, at, parsed.doc.type.schema.text('.')).doc;
		const out = serializeMarkdownFile(parsed, doc);
		expect(parseMarkdownFile(out).doc.toString()).toBe(doc.toString());
	});
});
