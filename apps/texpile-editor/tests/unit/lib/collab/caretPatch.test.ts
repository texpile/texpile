// the editor's own text parsed again (fresh stamps after a pause in typing) is patched in while it is not
// focused; the caret stays where it is
import { it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { emptyMap } from '$lib/editor/visual/sourceSpans';
import { carriedOffset } from '$lib/collab/caretPatch';

it('carries the caret through a re-parse of the same text unmoved', () => {
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hello there')])]);
	const text = 'hello there\n';
	expect(carriedOffset(doc, 4, 3, emptyMap(), text, text)).toBe(3);
});
