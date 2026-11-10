import { describe, expect, it } from 'vitest';
import { Fragment, Slice } from 'prosemirror-model';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';

describe('an item added to a tight Markdown list', () => {
	it('goes on the next line, so the list stays tight', () => {
		const parsed = parseMarkdownFile('# Readme\n\n- apples\n- pears\n\nEnd.\n');
		const { doc } = parsed;
		let at = -1;
		doc.forEach((n, pos) => {
			if (n.type.name === 'list' && n.textContent === 'pears') at = pos + n.nodeSize;
		});
		const pears = doc.resolve(at).nodeBefore!;
		const three = pears.type.create(pears.attrs, pears.firstChild!.type.create(null, doc.type.schema.text('three')));
		const out = serializeMarkdownFile(parsed, doc.replace(at, at, new Slice(Fragment.from(three), 0, 0)));
		expect(out).toBe('# Readme\n\n- apples\n- pears\n- three\n\nEnd.\n');
	});
});
