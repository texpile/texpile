import { describe, expect, it } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';

const FIGURE = '#figure(\n  table(\n    columns: 2,\n    [a], [b],\n  ),\n  caption: [Accuracy],\n) <acc>';

function figureParts(src: string): string[] {
	const parts: string[] = [];
	typstToProseMirror(src).doc.forEach((node) => {
		if (node.type.name === 'table_wrapper') node.forEach((child) => parts.push(child.type.name));
	});
	return parts;
}

describe('a table figure caption', () => {
	it('stands under the table, as Typst prints it', () => {
		expect(figureParts(FIGURE)).toEqual(['table', 'table_caption']);
		expect(serializeToTypst(typstToProseMirror(FIGURE).doc)).toBe(FIGURE);
	});

	it('stands over the table when the document rule puts it there', () => {
		const top = `#show figure.where(kind: table): set figure.caption(position: top)\n\n${FIGURE}`;
		expect(figureParts(top)).toEqual(['table_caption', 'table']);
		expect(serializeToTypst(typstToProseMirror(top).doc)).toBe(top);
		expect(figureParts(`#show figure.where(kind: image): set figure.caption(position: top)\n\n${FIGURE}`)).toEqual([
			'table',
			'table_caption'
		]);
	});
});
