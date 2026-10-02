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
});
