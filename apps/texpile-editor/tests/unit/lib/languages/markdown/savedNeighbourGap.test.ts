import { describe, it, expect } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { parseMarkdownFile, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { verifiedSerialize } from '$lib/workspace/verifiedSerialize';

const SRC = 'Alpha\n\n[r1]: https://a.example\n[^1]: Note.\n';

describe('markdown: a save that writes a neighbour again', () => {
	it('keeps the line end between two definition lines', async () => {
		const parsed = parseMarkdownFile(SRC);
		const end = 1 + parsed.doc.child(0).content.size;
		const tr = new Transform(parsed.doc);
		tr.split(end);
		tr.insert(tr.mapping.map(end) + 1, parsed.doc.type.schema.text('**bold** and [l](http://x.y)'));
		const first = serializeMarkdownFileDetailed(parsed, tr.doc);
		const v = await verifiedSerialize({
			format: 'md',
			doc: tr.doc,
			first,
			serialize: (d, afresh) => serializeMarkdownFileDetailed(parsed, d, afresh),
			reparse: (t) => Promise.resolve(parseMarkdownFile(t).doc)
		});
		expect(v.text).toContain('[r1]: https://a.example\n[^1]: Note.\n');
	});
});
