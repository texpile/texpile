import { expect, it } from 'vitest';
import { tagLook } from '$lib/editor/canvas/style/base/baseTags';

// the browser centers a header cell; a Markdown table's head lost it on the canvas
it('centers a header cell as the browser does, a data cell keeps the text side', () => {
	expect(tagLook('th').textAlign).toBe('center');
	expect(tagLook('td').textAlign).toBeUndefined();
});
