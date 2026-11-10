import { it, expect } from 'vitest';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { EditorState } from 'prosemirror-state';
import { carriedOffset, patchAroundCaret } from '$lib/collab/caretPatch';
import { offsetAtPm, caretAtOffset } from '$lib/editor/visual/sourceMap';

// two collaborators type at once: one in the paragraph above, one after the caret in its own paragraph
it('carries the caret past a change above it when another lands after it', () => {
	const oldSource = 'Delta one here.\n\nEcho two here.\n';
	const newSource = 'Delta HHH one here.\n\nEcho two here SSS.\n';
	const parsed = parseLatexFile(oldSource);
	const offset = oldSource.indexOf('two') + 3;
	const head = caretAtOffset(parsed.map, oldSource, offset)!;
	expect(offsetAtPm(parsed.map, head)).toBe(offset);
	expect(carriedOffset(parsed.doc, head, offset, parsed.map, oldSource, newSource)).toBe(newSource.indexOf('two') + 3);
});

// the same in the caret's own paragraph: one stretch over both changes took the caret back to the first
it('keeps the caret between two changes in its own paragraph', () => {
	const oldSource = 'Delta intro text lives in its own file.\n';
	const newSource = 'Delta intro HHH text lives in its own file SSS.\n';
	const parsed = parseLatexFile(oldSource);
	const offset = oldSource.indexOf('its') + 3;
	const head = caretAtOffset(parsed.map, oldSource, offset)!;
	const next = parseLatexFile(newSource);
	const tr = EditorState.create({ doc: parsed.doc }).tr;
	expect(patchAroundCaret(tr, next.doc, head, parsed.map, next.map, oldSource, newSource)).not.toBeNull();
	const $head = tr.doc.resolve(tr.mapping.map(head, -1));
	expect($head.parent.textBetween(0, $head.parentOffset)).toBe('Delta intro HHH text lives in its');
	expect($head.parent.textContent).toBe('Delta intro HHH text lives in its own file SSS.');
});
