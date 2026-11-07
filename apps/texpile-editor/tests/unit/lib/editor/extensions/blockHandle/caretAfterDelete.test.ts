import { describe, it, expect } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { caretAfterDelete } from '$lib/editor/visual/extensions/blockHandle/caretAfterDelete';

function gapBefore(md: string, text: string) {
	const parsed = parseMarkdownFile(md).doc;
	let at = -1;
	let size = 0;
	parsed.forEach((n, off) => {
		if (n.textContent === text) [at, size] = [off, n.nodeSize];
	});
	return { doc: new Transform(parsed).delete(at, at + size).doc, at };
}

describe('the caret after a block is deleted', () => {
	it('goes to the end of the text block before it, past a raw block', () => {
		const { doc, at } = gapBefore('First\n\n<div>\nraw\n</div>\n\nGone\n\n[r]: http://a\n', 'Gone');
		const sel = caretAfterDelete(doc, at);
		expect(sel.$from.parent.textContent).toBe('First');
		expect(sel.$from.parentOffset).toBe(5);
	});

	it('goes to the start of the next text block when none comes before', () => {
		const { doc, at } = gapBefore('Gone\n\n[r]: http://a\n\nNext\n', 'Gone');
		const sel = caretAfterDelete(doc, at);
		expect(sel.$from.parent.textContent).toBe('Next');
		expect(sel.$from.parentOffset).toBe(0);
	});
});
