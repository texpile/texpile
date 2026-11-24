// the chip's line guard must reject only transactions that ADD lines: a flat lines>1 check
// froze every chip whose captured source slice already spanned lines - caret stuck, typing
// dead, and the language reconfigure (a transaction too) swallowed, so the chip stayed
// unhighlighted (the BERT appendix caption chip)
import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { singleLineGuard } from '$lib/editor/visual/extensions/raw-latex/singleLineGuard';

const state = (doc: string) => EditorState.create({ doc, extensions: [singleLineGuard] });

describe('inline chip singleLineGuard', () => {
	it('a caret move inside an already multi-line chip applies', () => {
		const s = state('\\caption{line one\n%comment\nline three}');
		const next = s.update({ selection: EditorSelection.cursor(20) }).state;
		expect(next.selection.main.head).toBe(20);
	});

	it('typing inside a multi-line chip applies', () => {
		const s = state('a\nb');
		const next = s.update({ changes: { from: 1, insert: 'x' } }).state;
		expect(next.doc.toString()).toBe('ax\nb');
	});

	it('deleting a newline applies (a chip may collapse toward one line)', () => {
		const s = state('a\nb');
		const next = s.update({ changes: { from: 1, to: 2 } }).state;
		expect(next.doc.toString()).toBe('ab');
	});

	it('inserting a newline is still rejected, single-line and multi-line alike', () => {
		for (const doc of ['ab', 'a\nb']) {
			const s = state(doc);
			const next = s.update({ changes: { from: 1, insert: '\n' } }).state;
			expect(next.doc.toString()).toBe(doc);
		}
	});
});
