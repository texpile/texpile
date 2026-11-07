// block-level calls among prose end their paragraph, as Typst ends it, and a body given as the last argument is content
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

function shape(src: string): string[] {
	return typstToProseMirror(src).doc.content.content.map((n) => n.type.name);
}

function saved(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

function firstTextblock(doc: Node): { node: Node; pos: number } {
	let found: { node: Node; pos: number } | null = null;
	doc.descendants((node, pos) => {
		if (!found && node.isTextblock) found = { node, pos };
		return !found;
	});
	return found!;
}

/** the file after typing `text` at the end of its first textblock */
function typedAtEnd(src: string, text: string): string {
	const parsed = parseTypstFile(src);
	const { node, pos } = firstTextblock(parsed.doc);
	return serializeTypstFile(parsed, EditorState.create({ doc: parsed.doc }).tr.insertText(text, pos + 1 + node.content.size).doc);
}

/** the file after a paragraph is added at the end of the first top-level block */
function withParagraph(src: string): string {
	const parsed = parseTypstFile(src);
	const { schema } = parsed.doc.type;
	const holder = parsed.doc.child(0);
	const tr = EditorState.create({ doc: parsed.doc }).tr.insert(
		holder.nodeSize - 1,
		schema.nodes.paragraph.create(null, schema.text('new'))
	);
	return serializeTypstFile(parsed, tr.doc);
}

describe('a block-level call among prose', () => {
	const prose = 'Results look like\n#figure(image("a.png"), caption: [A plot]) <fig:a>\nwhich shows it.\n';

	it('stands as its own block with the label after it, the prose around it paragraphs', () => {
		const doc = typstToProseMirror(prose).doc;
		expect(doc.content.content.map((n) => n.type.name)).toEqual(['paragraph', 'image', 'paragraph']);
		expect(doc.child(1).attrs.label).toBe('fig:a');
		expect(saved(prose)).toBe(prose);
	});

	it('a display equation call is the equation with its label', () => {
		const equation = typstToProseMirror('#math.equation(block: true, $x$) <eq>\n').doc.child(0);
		expect(equation.type.name).toBe('block_math');
		expect(equation.attrs.label).toBe('eq');
	});

	it('first on its line before more calls, as a line and a space are', () => {
		expect(shape('#line(length: 100%)\n#v(1.8em)\n#align(center)[Title]\n')).toEqual(['horizontal_rule', 'raw_latex', 'typ_env']);
	});

	it('an inline call among prose stays in its paragraph', () => {
		expect(shape('Some #box[boxed] and #h(1em) text.\n')).toEqual(['paragraph']);
	});
});

describe('a call alone in its paragraph', () => {
	it('an inline element is inline content', () => {
		const doc = typstToProseMirror('#linebreak()\n').doc;
		expect(doc.child(0).type.name).toBe('paragraph');
		expect(doc.child(0).child(0).type.name).toBe('hard_break');
	});
});

describe('a table', () => {
	it("holds a package's rules between its rows", async () => {
		const src =
			'#import "@preview/booktabs:0.0.4": *\n\n#table(\n  columns: 2,\n  toprule(),\n  [a], [b],\n  midrule(),\n  [c], [d],\n  bottomrule(),\n)\n';
		typstScopeNow.current = await scopeOfFile(src, null);
		let table;
		try {
			table = typstToProseMirror(src).doc.child(1);
		} finally {
			typstScopeNow.current = null;
		}
		expect(table.type.name).toBe('table');
		expect(table.child(1).attrs.typRules).toEqual(['midrule()']);
		expect(table.attrs.typBottomRules).toEqual(['bottomrule()']);
	});
});

describe('a body given as the last argument', () => {
	const aligned = '#align(center, table(\n  columns: 2,\n  [a], [b],\n))\n\nAfter.\n';

	it('is the content of the call, a table a table, and saves as the file had it', () => {
		const env = typstToProseMirror(aligned).doc.child(0);
		expect(env.type.name).toBe('typ_env');
		expect(env.attrs).toMatchObject({ name: 'align', args: 'center', code: true });
		expect(env.child(0).type.name).toBe('table');
		expect(saved(aligned)).toBe(aligned);
	});

	it('a content block in the parentheses is editable content', () => {
		const env = typstToProseMirror('#block(width: 50%, [Some *text*])\n').doc.child(0);
		expect(env.type.name).toBe('typ_env');
		expect(env.child(0).type.name).toBe('paragraph');
		expect(env.textContent).toBe('Some text');
	});
});

describe('a body written as code, edited', () => {
	it('a string stays a string, its text escaped as a string', () => {
		expect(typedAtEnd('#block(width: 50%, "a string")\n', 'q"u\\o')).toBe('#block(width: 50%, "a stringq\\"u\\\\o")\n');
		expect(typedAtEnd('#table(columns: 2, strong("x"), [y])\n', '"')).toBe('#table(columns: 2, [#strong[x"]], [y])\n');
		expect(typedAtEnd('#emph("x")\n', '"')).toBe('#emph[x"]\n');
	});

	it('an equation with text beside it becomes a content block', () => {
		expect(typedAtEnd('#align(center, $x$)\n', 'Z')).toBe('#align(center, [$x$Z])\n');
	});

	it('a second block puts the body in a content block, its code marked as code', () => {
		expect(withParagraph('#align(center, ident)\n')).toBe('#align(center, [#ident\n\nnew])\n');
		expect(withParagraph('#align(center, emph("x"))\n')).toBe('#align(center, [#emph[x]\n\nnew])\n');
	});
});
