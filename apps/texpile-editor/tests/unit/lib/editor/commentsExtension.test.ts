// The comments StateField must survive ranges resolved against some OTHER text: the controller
// re-anchors on file open, so a mount can adopt a list belonging to the previous file, or to a
// longer stale copy of this one. Before the adoption filter, one such range made the gutter's
// lineAt() throw inside every later transaction and wedged the whole source editor.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { comments, setCommentRanges, commentAt } from '$lib/editor/visual/extensions/comments';

function state(doc: string) {
	return EditorState.create({ doc, extensions: comments() });
}

function type(s: EditorState, at: number, text: string) {
	return s.update({ changes: { from: at, to: at, insert: text } }).state;
}

describe('comments extension adoption', () => {
	it('adopts in-bounds ranges and maps them through edits', () => {
		let s = state('one two three');
		s = s.update({ effects: setCommentRanges.of([{ id: 'a', from: 4, to: 7, resolved: false }]) }).state;
		expect(commentAt(s, 5)?.id).toBe('a');
		s = type(s, 0, 'x');
		expect(commentAt(s, 6)?.id).toBe('a');
	});

	it('drops ranges past the end of the document instead of throwing later', () => {
		let s = state('short doc');
		// offset 1934 in a 9-char doc: the shape of the stale main.typ list that froze the editor
		s = s.update({
			effects: setCommentRanges.of([
				{ id: 'stale', from: 1934, to: 1960, resolved: false },
				{ id: 'ok', from: 0, to: 5, resolved: false }
			])
		}).state;
		expect(commentAt(s, 1)?.id).toBe('ok');
		expect(commentAt(s, 8)).toBeNull();
		// every transaction recomputes the gutter markers; this is where the RangeError used to fire
		expect(() => {
			s = type(s, 2, 'x');
			s = type(s, 3, 'y');
		}).not.toThrow();
		expect(commentAt(s, 1)?.id).toBe('ok');
	});

	it('drops inverted and negative ranges, and keeps an empty one as a point', () => {
		let s = state('abcdef');
		s = s.update({
			effects: setCommentRanges.of([
				{ id: 'neg', from: -3, to: 2, resolved: false },
				{ id: 'inv', from: 5, to: 4, resolved: false },
				{ id: 'point', from: 3, to: 3, resolved: false }
			])
		}).state;
		expect(commentAt(s, 1)).toBeNull();
		expect(commentAt(s, 5)).toBeNull();
		expect(commentAt(s, 3)).toMatchObject({ id: 'point', from: 3, to: 3 });
	});
});
