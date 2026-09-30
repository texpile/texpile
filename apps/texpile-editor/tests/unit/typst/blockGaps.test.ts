// The gap between two blocks is part of what typst reads: a single line end keeps
// `Text.\n#set text(red)\nMore.` one paragraph and `- a\n  - b` a tight nest, a blank line is a
// paragraph break. Regenerating a block used to force a blank line at every boundary (T6, T7)
// and a list run was always re-emitted tight (T16). Each block now remembers the gap before it.
import { describe, it, expect } from 'vitest';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import type { Node } from 'prosemirror-model';

/** every block regenerates: the converter's docs carry no norm, so nothing is verbatim */
function regen(src: string): string {
	return serializeToTypst(typstToProseMirror(src).doc);
}

/** the single-edit path: block `i` replaced, every other block still pristine */
function editBlock(src: string, i: number, edit: (node: Node) => Node): string {
	const parsed = parseTypstFile(src);
	const kids: Node[] = [];
	parsed.doc.forEach((child, _o, k) => kids.push(k === i ? edit(child) : child));
	return serializeTypstFile(parsed, parsed.doc.copy(typSchema.nodes.doc.create(null, kids).content));
}

const retext = (text: string) => (node: Node) => node.type.create({ ...node.attrs }, typSchema.text(text), node.marks);

describe('a single newline between blocks survives an edit on either side (T6)', () => {
	it('paragraph edited above a #set', () => {
		expect(editBlock('Text.\n#set text(red)\nMore.\n', 0, retext('EDITED'))).toBe('EDITED\n#set text(red)\nMore.\n');
	});

	it('#set edited between two paragraph lines', () => {
		expect(editBlock('Text.\n#set text(red)\nMore.\n', 1, retext('#set text(blue)'))).toBe('Text.\n#set text(blue)\nMore.\n');
	});

	it('text edited above a list', () => {
		expect(editBlock('Intro:\n- a\n- b\n', 0, retext('EDITED:'))).toBe('EDITED:\n- a\n- b\n');
	});

	it('an include edited above another', () => {
		const out = editBlock('#include "a.typ"\n#include "b.typ"\n', 0, (n) => n.type.create({ ...n.attrs, path: 'c.typ' }));
		expect(out).toBe('#include "c.typ"\n#include "b.typ"\n');
	});

	it('a blank line stays exactly one blank line', () => {
		expect(editBlock('Text.\n\n#set text(red)\n', 0, retext('EDITED'))).toBe('EDITED\n\n#set text(red)\n');
	});
});

describe('nested lists regenerate as written (T7, T16)', () => {
	it('a tight nest stays tight', () => {
		expect(regen('- a\n  - b\n    - c\n- d\n')).toBe('- a\n  - b\n    - c\n- d');
		expect(regen('/ Term: desc\n  - nested\n')).toBe('/ Term: desc\n  - nested');
	});

	it('a loose list stays loose', () => {
		expect(regen('- one\n\n- two\n\n- three\n')).toBe('- one\n\n- two\n\n- three');
		expect(regen('- a\n\n  - b\n- c\n')).toBe('- a\n\n  - b\n- c');
	});
});
