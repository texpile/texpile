// @vitest-environment jsdom
// Where a comment ENDS when you type at its edge. Both views map their ranges through every
// transaction, and the association bias in that mapping is the whole behaviour: with the bias
// pointing into the range, text typed at a boundary is swallowed and the highlight keeps growing
// under the cursor - the comment appears never to end. The bias must point away from the range.
//
// Both editors are covered because the two must agree: a thread that ends at "world" in source
// mode cannot cover "world and more" after the same keystroke in visual mode.
import { describe, it, expect } from 'vitest';
import { EditorState as CmState } from '@codemirror/state';
import { EditorState as PmState } from 'prosemirror-state';
import { schema as texSchema } from '$lib/languages/latex/schema/latexPMSchema';
import { comments, setCommentRanges, commentAt } from '$lib/editor/visual/extensions/comments';
import { pmComments, pmCommentsKey, pmCommentAt } from '$lib/editor/visual/extensions/pmComments';

const RANGE = { id: 't1', resolved: false };

describe('source editor comment edges', () => {
	// "hello world" with a comment on "world" (offsets 6..11)
	function seeded() {
		const state = CmState.create({ doc: 'hello world', extensions: [comments()] });
		return state.update({ effects: setCommentRanges.of([{ ...RANGE, from: 6, to: 11 }]) }).state;
	}

	it('leaves text typed at the right edge outside the comment', () => {
		const next = seeded().update({ changes: { from: 11, insert: '!!' } }).state;
		expect(commentAt(next, 11)).not.toBeNull(); // still on the last character of "world"
		expect(commentAt(next, 13)).toBeNull(); // the new text is not commented
	});

	it('leaves text typed at the left edge outside the comment', () => {
		const next = seeded().update({ changes: { from: 6, insert: 'big ' } }).state;
		expect(commentAt(next, 6)).toBeNull();
		expect(next.doc.sliceString(commentAt(next, 12)!.from, commentAt(next, 12)!.to)).toBe('world');
	});

	it('still grows for an edit strictly inside', () => {
		const next = seeded().update({ changes: { from: 8, insert: 'RRR' } }).state;
		const r = commentAt(next, 8)!;
		expect(next.doc.sliceString(r.from, r.to)).toBe('woRRRrld');
	});

	it('keeps a range whose text is deleted as a point where it was, before anything typed there', () => {
		const next = seeded().update({ changes: { from: 6, to: 11, insert: '' } }).state;
		expect(commentAt(next, 6)).toMatchObject({ from: 6, to: 6 });
		const typed = next.update({ changes: { from: 6, insert: 'there' } }).state;
		expect(commentAt(typed, 6)).toMatchObject({ from: 6, to: 6 });
		expect(commentAt(typed, 8)).toBeNull();
	});
});

describe('visual editor comment edges', () => {
	// one paragraph of "hello world"; PM positions put "world" at 7..12
	function seeded() {
		const doc = texSchema.node('doc', null, [texSchema.node('paragraph', null, [texSchema.text('hello world')])]);
		const state = PmState.create({ doc, plugins: pmComments() });
		return state.apply(state.tr.setMeta(pmCommentsKey, { type: 'set', ranges: [{ ...RANGE, from: 7, to: 12 }] }));
	}

	const textOf = (state: PmState, r: { from: number; to: number }) => state.doc.textBetween(r.from, r.to);

	it('leaves text typed at the right edge outside the comment', () => {
		const s = seeded();
		const next = s.apply(s.tr.insertText('!!', 12));
		expect(textOf(next, pmCommentAt(next, 12)!)).toBe('world');
		expect(pmCommentAt(next, 14)).toBeNull();
	});

	it('leaves text typed at the left edge outside the comment', () => {
		const s = seeded();
		const next = s.apply(s.tr.insertText('big ', 7));
		expect(pmCommentAt(next, 7)).toBeNull();
		expect(textOf(next, pmCommentAt(next, 13)!)).toBe('world');
	});

	it('still grows for an edit strictly inside', () => {
		const s = seeded();
		const next = s.apply(s.tr.insertText('RRR', 9));
		expect(textOf(next, pmCommentAt(next, 9)!)).toBe('woRRRrld');
	});

	it('keeps a range whose text is deleted as a point where it was, before anything typed there', () => {
		const s = seeded();
		const next = s.apply(s.tr.delete(7, 12));
		expect(pmCommentAt(next, 7)).toMatchObject({ from: 7, to: 7 });
		const typed = next.apply(next.tr.insertText('there', 7));
		expect(pmCommentAt(typed, 7)).toMatchObject({ from: 7, to: 7 });
		expect(pmCommentAt(typed, 9)).toBeNull();
	});
});
