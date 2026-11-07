// The parser's own tests: offsets, tree shape, tagging and reparsing. Deliberately free of any
// CodeMirror dependency — this package produces a Lezer parser, and anything that needs an
// EditorState is testing the app's wiring, not this.
import { describe, it, expect } from 'vitest';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import type { Tree } from '@lezer/common';
import { TypstParser, typstHighlight } from '../src/index.js';

/** a fresh parser per test: the wasm instance carries incremental state between parses */
const parser = () => new TypstParser(typstHighlight);

const named = tagHighlighter([
	{ tag: tags.comment, class: 'comment' },
	{ tag: tags.heading, class: 'heading' },
	{ tag: tags.strong, class: 'strong' },
	{ tag: tags.string, class: 'string' },
	{ tag: tags.definitionKeyword, class: 'defkeyword' },
	{ tag: tags.controlKeyword, class: 'control' },
	{ tag: tags.variableName, class: 'variable' }
]);

/** every leaf, in document order, as {name, text} */
function leaves(tree: Tree, doc: string): { name: string; text: string }[] {
	const out: { name: string; text: string }[] = [];
	tree.cursor().iterate((n) => {
		if (n.to > n.from && n.node.firstChild == null) out.push({ name: n.name, text: doc.slice(n.from, n.to) });
	});
	return out;
}

function classes(tree: Tree, doc: string): Record<string, string> {
	const found: Record<string, string> = {};
	highlightTree(tree, named, (from, to, cls) => {
		found[doc.slice(from, to)] = cls;
	});
	return found;
}
const entry = (found: Record<string, string>, needle: string) => Object.entries(found).find(([text]) => text.includes(needle))?.[1] ?? '';

describe('TypstParser', () => {
	it('produces a tree spanning the whole document', () => {
		const doc = '= Heading\n\nBody text.\n';
		expect(parser().parse(doc).length).toBe(doc.length);
	});

	it('emits leaves that tile the source exactly', () => {
		// if the leaves do not reassemble the document, every offset downstream is wrong
		const doc = '// note\n= Title\n\n#let a = 1\n';
		const joined = leaves(parser().parse(doc), doc)
			.map((l) => l.text)
			.join('');
		expect(joined).toBe(doc);
	});

	it('keeps offsets correct across astral-plane characters', () => {
		// an emoji is ONE code point, TWO UTF-16 units and FOUR bytes. Typst counts bytes and Lezer
		// counts UTF-16 units; getting the conversion wrong drifts from here to end of file.
		const doc = 'text 🎉 more *strong* and 𝕏 too\n';
		const tree = parser().parse(doc);
		expect(tree.length).toBe(doc.length);
		expect(
			leaves(tree, doc)
				.map((l) => l.text)
				.join('')
		).toBe(doc);
	});

	it('uses Typst SyntaxKind variant names as node names', () => {
		// NOT SyntaxKind::name(), which is prose ("line comment"). Tag maps key off the variants.
		const names = leaves(parser().parse('// c\n= H\n'), '// c\n= H\n').map((l) => l.name);
		expect(names).toContain('LineComment');
		expect(names).toContain('HeadingMarker');
	});

	it('tags comments, headings and keywords', () => {
		const doc = '// note\n= Heading\n\n#let a = "hi"\n';
		const found = classes(parser().parse(doc), doc);
		expect(entry(found, 'note')).toBe('comment');
		expect(entry(found, 'Heading')).toBe('heading');
		expect(entry(found, 'let')).toBe('defkeyword');
		expect(entry(found, '"hi"')).toBe('string');
	});

	it('reparses when the text changes', () => {
		// the same parser instance across parses: Source::replace diffs internally, so this is the
		// incremental path, and a desync would show up as a stale tree
		const p = parser();
		const first = '= One\n';
		expect(p.parse(first).length).toBe(first.length);
		const second = '= Two Words Here\n';
		const tree = p.parse(second);
		expect(tree.length).toBe(second.length);
		expect(entry(classes(tree, second), 'Two')).toBe('heading');
	});

	it('shrinks correctly when text is deleted', () => {
		const p = parser();
		p.parse('= Heading\n\nlots of body text here\n');
		const shorter = '= H\n';
		expect(p.parse(shorter).length).toBe(shorter.length);
	});

	it('reads code as code with forCode, its tree the code alone', () => {
		const doc = 'rect(width: 0.9 * 3.25in, stroke: 0.4pt)';
		const tree = parser().forCode().parse(doc);
		expect(tree.length).toBe(doc.length);
		const names = leaves(tree, doc).map((l) => l.name);
		expect(names).toContain('Star');
		expect(names).not.toContain('Strong');
		expect(
			leaves(tree, doc)
				.map((l) => l.text)
				.join('')
		).toBe(doc);
	});

	it('handles an empty document', () => {
		expect(parser().parse('').length).toBe(0);
	});

	it('still covers the whole file after unterminated syntax', () => {
		// An unterminated string swallows the rest of the line by design - `= Later Heading` really
		// is inside the Str, not a heading - so this asserts coverage, not that the heading survives.
		// What matters is that the tree still spans the document instead of truncating at the error.
		const doc = '#let s = "unterminated\n= Later Heading\n';
		const tree = parser().parse(doc);
		expect(tree.length).toBe(doc.length);
		expect(
			leaves(tree, doc)
				.map((l) => l.text)
				.join('')
		).toBe(doc);
	});

	it('assigns stable node ids across parses', () => {
		// ids index into a NodeSet shared by every tree this parser makes; renumbering between
		// parses would make an older tree decode to the wrong node types
		const p = parser();
		const a = p.parse('= Heading\n');
		const idOf = (t: Tree, name: string) => {
			let id = -1;
			t.cursor().iterate((n) => {
				if (n.name === name && id < 0) id = n.type.id;
			});
			return id;
		};
		const headingId = idOf(a, 'Heading');
		expect(headingId).toBeGreaterThan(0);
		// a document introducing new kinds must not renumber the ones already handed out
		const b = p.parse('#let f(x) = x\n#f(1)\n= Heading\n');
		expect(idOf(b, 'Heading')).toBe(headingId);
	});
});
