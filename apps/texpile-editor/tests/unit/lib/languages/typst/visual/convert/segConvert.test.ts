import { describe, it, expect } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('a heading deeper than six levels', () => {
	it('keeps its depth when it is written afresh, and an untouched one keeps its bytes', () => {
		const src = '= Top\n\n======= Deep\n\n#heading(level: 8, numbering: none)[Deeper]\n';
		const parsed = parseTypstFile(src);
		expect(serializeTypstFile(parsed, parsed.doc)).toBe(src);
		// a label given to each makes it a new node, written from the document rather than spliced
		const tr = new Transform(parsed.doc);
		parsed.doc.forEach((node, offset, i) => {
			if (i > 0) tr.setNodeMarkup(offset, undefined, { ...node.attrs, label: `h${i}` });
		});
		expect(serializeTypstFile(parsed, tr.doc)).toBe('= Top\n\n======= Deep <h1>\n\n#heading(level: 8, numbering: none)[Deeper] <h2>\n');
	});
});
