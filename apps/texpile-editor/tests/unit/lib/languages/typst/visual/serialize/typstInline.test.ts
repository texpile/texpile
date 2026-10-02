import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema as S } from '$lib/languages/typst/visual/schema';

/** a paragraph holding `text`, written out and read back */
function reread(text: string): Node {
	const out = serializeToTypst(S.nodes.doc.create(null, [S.nodes.paragraph.create(null, S.text(text))]));
	return typstToProseMirror(out).doc.child(0);
}

describe('text written out reads back as the same characters', () => {
	it('two hyphens typed side by side stay two hyphens', () => {
		expect(reread('pages 10--12').textContent).toBe('pages 10--12');
		expect(reread('a---b').textContent).toBe('a---b');
	});

	it('a dash opening a line stays one', () => {
		expect(reread('—Indeed, she said.').textContent).toBe('—Indeed, she said.');
		expect(reread('– I agree.').textContent).toBe('– I agree.');
		const cell = S.nodes.table_cell.create(null, S.nodes.paragraph.create(null, S.text('–')));
		const table = S.nodes.table.create({ colspec: '1' }, [S.nodes.table_row.create(null, [cell])]);
		const back = typstToProseMirror(serializeToTypst(S.nodes.doc.create(null, [table]))).doc;
		expect(back.child(0).textContent).toBe('–');
	});

	it('a dash opening an underlined stretch stays one', () => {
		const para = S.nodes.paragraph.create(null, [S.text('Words '), S.text('— and', [S.marks.u.create()]), S.text(' more.')]);
		const out = serializeToTypst(S.nodes.doc.create(null, [para]));
		expect(typstToProseMirror(out).doc.child(0).textContent).toBe('Words — and more.');
	});

	it('an ellipsis after the number opening a line stays one, and typed dots stay dots', () => {
		expect(reread('2… and counting').textContent).toBe('2… and counting');
		expect(reread('2... dots').textContent).toBe('2... dots');
		const para = S.nodes.paragraph.create(null, [S.text('Then '), S.text('3… more', [S.marks.u.create()])]);
		const out = serializeToTypst(S.nodes.doc.create(null, [para]));
		expect(typstToProseMirror(out).doc.child(0).textContent).toBe('Then 3… more');
	});
});
