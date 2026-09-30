// A call wrapping content on its own lines (`#theorem[...]`, `#align(center)[...]`) is a typ_env:
// the call and its arguments above, the body editable below. Unedited it writes its bytes back;
// edited, only what changed is written afresh - a header edit keeps the body's bytes, a body edit
// keeps the header's.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';

/** environment fixtures, each real Typst: the definitions they call are in the fixture */
export const ENVIRONMENTS: Record<string, string> = {
	theorem:
		'#let theorem(body) = figure(kind: "thm", supplement: [Theorem], block(stroke: 0.5pt, inset: 8pt, body))\n\n#theorem[The sum of two *even* numbers is even.] <thm:even>\n\nBy @thm:even, done.\n',
	argsAndLists:
		'#let lemma(title: none, body) = block[*Lemma* (#title). #body]\n\n#lemma(title: "Zorn")[\n  Every chain has an upper bound.\n\n  - first\n  - second\n]\n',
	builtins: '#align(center)[Centered text.]\n\n#block(inset: 1em, stroke: red)[\n  Inside a block.\n]\n\n#rect[boxed]\n',
	nested: '#block(stroke: 1pt)[\n  Outer text.\n\n  #rect(inset: 4pt)[\n    Inner text.\n  ]\n]\n',
	awkward: '#block(  inset : 2pt ,  )[   spaced   body   ]   <blk>\n\n#pad(x: 1em)[\n\n\n  Blank lines around.\n\n\n]\n',
	commented: '#block[\n  // a note to self\n  Text after the note.\n  /* inline */ and more.\n]\n',
	labelNextLine: '#figure(kind: "thm", supplement: [Theorem])[Stated.]\n<thm:next>\n\nSee @thm:next.\n',
	multilineArgs: '#block(\n  inset: 1em,\n  stroke: (paint: blue, thickness: 1pt),\n)[\n  Body.\n]\n',
	emptyBodies: '#rect[]\n\n#rect[ ]\n\n#rect[\n]\n',
	inList: '- #rect[boxed in a list]\n- plain item\n',
	moduleCall: '#std.align(right)[Right.]\n\n#columns(2)[\n  Left.\n\n  #colbreak()\n\n  Right.\n]\n'
};

/** calls that are not containers and keep whatever they were before */
const NOT_ENVIRONMENTS: Record<string, string> = {
	twoBodies: '#grid(columns: 2)[a][b]\n',
	inlineMark: '#underline(stroke: red)[fancy]\n',
	inlineQuote: '#quote[inline stays raw]\n',
	figure: '#figure(rect(), caption: [not an image])\n',
	footnote: 'Text.#footnote[a note]\n\n#footnote[alone]\n',
	codeBody: '#block({ [a]; [b] })\n',
	showRule: '#show: rest => block(rest)\n',
	noBody: '#lorem(5)\n',
	proseAfter: '#rect[x] and prose after it.\n'
};

function roundtrip(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

function shape(src: string): string[] {
	return typstToProseMirror(src).doc.content.content.map((n) => n.type.name);
}

/** every typ_env in the doc with its position */
function envs(doc: Node): { node: Node; pos: number }[] {
	const out: { node: Node; pos: number }[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'typ_env') out.push({ node, pos });
	});
	return out;
}

/** parse, change the first environment's attrs, save */
function editAttrs(src: string, attrs: Record<string, unknown>, which = 0): string {
	const parsed = parseTypstFile(src);
	const { node, pos } = envs(parsed.doc)[which];
	const tr = EditorState.create({ doc: parsed.doc }).tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
	return serializeTypstFile(parsed, tr.doc);
}

/** parse, type `text` at the end of the textblock holding `anchor`, save */
function typeAfter(src: string, anchor: string, text: string): string {
	const parsed = parseTypstFile(src);
	let at = -1;
	parsed.doc.descendants((node, pos) => {
		if (at < 0 && node.isTextblock && node.textContent.includes(anchor)) at = pos + node.nodeSize - 1;
	});
	const state = EditorState.create({ doc: parsed.doc });
	const tr = state.tr.setSelection(TextSelection.create(state.doc, at)).insertText(text);
	return serializeTypstFile(parsed, tr.doc);
}

describe('environments round-trip byte for byte', () => {
	for (const [name, src] of Object.entries({ ...ENVIRONMENTS, ...NOT_ENVIRONMENTS })) {
		it(name, () => expect(roundtrip(src)).toBe(src));
	}
});

describe('regeneration reaches a fixed point', () => {
	for (const [name, src] of Object.entries({ ...ENVIRONMENTS, ...NOT_ENVIRONMENTS })) {
		it(name, () => {
			const gen1 = serializeToTypst(typstToProseMirror(src).doc);
			expect(serializeToTypst(typstToProseMirror(gen1).doc)).toBe(gen1);
		});
	}

	it('a regenerated environment is written as the file wrote it', () => {
		// two fixtures hold paragraphs written unlike the serializer writes one (spaced out, wrapped),
		// which is the paragraph's business, not the environment's
		for (const [name, src] of Object.entries(ENVIRONMENTS))
			if (name !== 'awkward' && name !== 'commented') expect(serializeToTypst(typstToProseMirror(src).doc)).toBe(src.trimEnd());
	});
});

describe('what becomes an environment', () => {
	it('a lone call wrapping content, with its arguments and label', () => {
		const { doc } = typstToProseMirror(ENVIRONMENTS.theorem);
		const [{ node }] = envs(doc);
		expect(node.attrs).toMatchObject({ name: 'theorem', args: null, label: 'thm:even', bodyLead: '', bodyTrail: '' });
		expect(node.childCount).toBe(1);
		expect(node.child(0).type.name).toBe('paragraph');
	});

	it('the arguments are kept verbatim, spacing and line ends included', () => {
		const [{ node }] = envs(typstToProseMirror(ENVIRONMENTS.multilineArgs).doc);
		expect(node.attrs.args).toBe('\n  inset: 1em,\n  stroke: (paint: blue, thickness: 1pt),\n');
		const [awkward] = envs(typstToProseMirror(ENVIRONMENTS.awkward).doc);
		expect(awkward.node.attrs.args).toBe('  inset : 2pt ,  ');
	});

	it('the body is visual content: paragraphs, lists, comments, nested environments', () => {
		const [outer, inner] = envs(typstToProseMirror(ENVIRONMENTS.nested).doc);
		expect(outer.node.content.content.map((n) => n.type.name)).toEqual(['paragraph', 'typ_env']);
		expect(inner.node.attrs.name).toBe('rect');
		const [lemma] = envs(typstToProseMirror(ENVIRONMENTS.argsAndLists).doc);
		expect(lemma.node.content.content.map((n) => n.type.name)).toEqual(['paragraph', 'list', 'list']);
		const [commented] = envs(typstToProseMirror(ENVIRONMENTS.commented).doc);
		expect(commented.node.child(0).type.name).toBe('raw_latex');
	});

	it('a module-qualified callee is one name', () => {
		const [{ node }] = envs(typstToProseMirror(ENVIRONMENTS.moduleCall).doc);
		expect(node.attrs).toMatchObject({ name: 'std.align', args: 'right' });
	});

	it('calls with a node, a chip or no single body of their own are left as they were', () => {
		for (const src of Object.values(NOT_ENVIRONMENTS)) expect(envs(typstToProseMirror(src).doc)).toEqual([]);
		expect(shape('#quote(block: true)[Quoted.]\n')).toEqual(['blockquote']);
		expect(shape('#figure(image("a.png"), caption: [c])\n')).toEqual(['image']);
		expect(shape('#underline[a whole paragraph]\n')).toEqual(['paragraph']);
		expect(shape('#heading(depth: 2)[Title]\n')).toEqual(['heading']);
	});
});

describe('an edit writes only what changed', () => {
	it('typing in the body keeps the call, the other blocks and the label', () => {
		const out = typeAfter(ENVIRONMENTS.argsAndLists, 'upper bound', ' Always');
		expect(out).toBe(ENVIRONMENTS.argsAndLists.replace('upper bound.', 'upper bound. Always'));
	});

	it('typing in a nested body keeps both frames', () => {
		const out = typeAfter(ENVIRONMENTS.nested, 'Inner', ' more');
		expect(out).toBe(ENVIRONMENTS.nested.replace('Inner text.', 'Inner text. more'));
	});

	it('changing the arguments rewrites the header and keeps the body bytes', () => {
		const out = editAttrs(ENVIRONMENTS.awkward, { args: 'inset: 4pt' });
		expect(out).toBe(ENVIRONMENTS.awkward.replace('(  inset : 2pt ,  )', '(inset: 4pt)'));
		const multi = editAttrs(ENVIRONMENTS.argsAndLists, { args: 'title: "Kuratowski"' }, 0);
		expect(multi).toBe(ENVIRONMENTS.argsAndLists.replace('"Zorn"', '"Kuratowski"'));
	});

	it('a header edit inside another container keeps both bodies', () => {
		expect(editAttrs(ENVIRONMENTS.nested, { args: 'inset: 8pt' }, 1)).toBe(ENVIRONMENTS.nested.replace('inset: 4pt', 'inset: 8pt'));
		expect(editAttrs(ENVIRONMENTS.nested, { args: 'stroke: 2pt' }, 0)).toBe(ENVIRONMENTS.nested.replace('stroke: 1pt', 'stroke: 2pt'));
		const listed = '- #block(inset: 1pt)[\n    Inside a list item,\n    over two lines.\n  ]\n- next\n';
		expect(editAttrs(listed, { args: 'inset: 2pt' })).toBe(listed.replace('1pt', '2pt'));
	});

	it('a header edit in a term keeps the body at the term’s indentation, however long its title', () => {
		for (const termed of [
			'/ Term: #rect[\n    boxed\n  ]\n',
			'- / Term: #rect[\n      boxed\n    ]\n',
			'/ Term: - #rect[\n      boxed\n    ]\n'
		])
			expect(editAttrs(termed, { args: 'inset: 2pt' })).toBe(termed.replace('#rect', '#rect(inset: 2pt)'));
	});

	it('renaming the call touches only the name', () => {
		const out = editAttrs(ENVIRONMENTS.multilineArgs, { name: 'rect' });
		expect(out).toBe(ENVIRONMENTS.multilineArgs.replace('#block(', '#rect('));
	});

	it('dropping the arguments drops the parentheses', () => {
		expect(editAttrs('#align(center)[x]\n', { args: null })).toBe('#align[x]\n');
	});

	it('the label is renamed, removed or added where typst reads it', () => {
		expect(editAttrs(ENVIRONMENTS.theorem, { label: 'thm:sum' })).toBe(ENVIRONMENTS.theorem.replace('<thm:even>', '<thm:sum>'));
		expect(editAttrs(ENVIRONMENTS.labelNextLine, { label: 'thm:moved' })).toBe(
			ENVIRONMENTS.labelNextLine.replace('<thm:next>', '<thm:moved>')
		);
		expect(editAttrs('#rect[x] <a>\n\nText.\n', { label: null })).toBe('#rect[x]\n\nText.\n');
		expect(editAttrs('#rect[x]\n\nText.\n', { label: 'b' })).toBe('#rect[x] <b>\n\nText.\n');
	});

	it("blocks joined in from another environment are written at this one's indentation", () => {
		// deleting from one body into the next leaves the second's list inside the first, whose body
		// opens on its bracket's line; the list's bytes, indented for the second, would nest wrongly
		const src = '#rect[The sum of two numbers is even.] <r>\n\n#block[\n  Every chain.\n\n  - first\n  - second\n    - nested\n]\n';
		const parsed = parseTypstFile(src);
		let from = -1;
		let to = -1;
		parsed.doc.descendants((node, pos) => {
			if (node.isText && node.text!.includes('two numbers')) from = pos + node.text!.indexOf('two');
			if (node.isText && node.text!.includes('Every chain')) to = pos + node.text!.indexOf('chain');
		});
		const edited = EditorState.create({ doc: parsed.doc }).tr.delete(from, to).doc;
		const out = serializeTypstFile(parsed, edited);
		expect(out).toBe('#rect[The sum of chain.\n\n- first\n- second\n  - nested] <r>\n');
		expect(typstToProseMirror(out).doc.toString()).toBe(edited.toString());
	});

	it('an edited environment reads back as the same environment', () => {
		const out = editAttrs(ENVIRONMENTS.nested, { args: 'stroke: 2pt' });
		const [outer, inner] = envs(typstToProseMirror(out).doc);
		expect(outer.node.attrs.args).toBe('stroke: 2pt');
		expect(inner.node.child(0).textContent).toBe('Inner text.');
	});
});

describe('an environment the editor makes', () => {
	const n = typSchema.nodes;
	const para = (s: string) => n.paragraph.create(null, s ? typSchema.text(s) : undefined);

	it('opens its body on a line of its own and reads back the same', () => {
		const env = n.typ_env.create({ name: 'theorem' }, [para('First.'), para('Second.')]);
		const src = serializeToTypst(n.doc.create(null, [env]));
		expect(src).toBe('#theorem[\n  First.\n\n  Second.\n]');
		const [{ node }] = envs(typstToProseMirror(src + '\n').doc);
		expect(node.attrs).toMatchObject({ name: 'theorem', args: null });
		expect(node.content.content.map((c) => c.textContent)).toEqual(['First.', 'Second.']);
	});

	it('with arguments, a label, and nothing typed yet', () => {
		const env = n.typ_env.create({ name: 'block', args: 'inset: 1em', label: 'b1' }, [para('')]);
		expect(serializeToTypst(n.doc.create(null, [env]))).toBe('#block(inset: 1em)[] <b1>');
	});

	it('a line comment ending an inline body does not swallow the bracket', () => {
		const src = '#rect[text]\n';
		const parsed = parseTypstFile(src);
		const [{ node, pos }] = envs(parsed.doc);
		const chip = n.inline_latex.create({ lang: 'typst' }, typSchema.text('// note'));
		const tr = EditorState.create({ doc: parsed.doc }).tr.insert(pos + node.nodeSize - 2, [typSchema.text(' '), chip]);
		const out = serializeTypstFile(parsed, tr.doc);
		expect(out).toBe('#rect[text // note\n]\n');
		expect(envs(typstToProseMirror(out).doc)).toHaveLength(1);
	});
});
