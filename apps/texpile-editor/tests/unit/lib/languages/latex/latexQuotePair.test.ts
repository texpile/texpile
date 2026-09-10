// the backtick pair keeps its own record of inserted closers: overtype and pair deletion apply to
// those and to nothing else in the document
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { latexQuotePair, openQuote, overtypeQuote, deleteQuotePair } from '$lib/languages/latex/source/latexQuotePair';

function state(doc: string, caret: number) {
	return EditorState.create({ doc, selection: { anchor: caret }, extensions: latexQuotePair() });
}

describe('latex quote pair', () => {
	it("opens `' at a line end, twice for double quotes, and steps over the closers", () => {
		let s = state('say ', 4);
		s = s.update(openQuote(s)!).state;
		expect(s.doc.toString()).toBe("say `'");
		expect(s.selection.main.head).toBe(5);
		s = s.update(openQuote(s)!).state;
		expect(s.doc.toString()).toBe("say ``''");
		s = s.update({ changes: { from: 6, insert: 'hi' }, selection: { anchor: 8 }, userEvent: 'input.type' }).state;
		s = s.update(overtypeQuote(s)!).state;
		s = s.update(overtypeQuote(s)!).state;
		expect(s.doc.toString()).toBe("say ``hi''");
		expect(s.selection.main.head).toBe(10);
		expect(overtypeQuote(s)).toBeNull();
	});

	it('stays a lone backtick before a word, and an apostrophe in prose is never stepped over', () => {
		expect(openQuote(state('a|b'.replace('|', ''), 1))).toBeNull();
		const s = state("it's", 2);
		expect(overtypeQuote(s)).toBeNull();
	});

	it('Backspace inside a fresh pair removes both, and a click away forgets the pair', () => {
		let s = state('', 0);
		s = s.update(openQuote(s)!).state;
		s = s.update(deleteQuotePair(s)!).state;
		expect(s.doc.toString()).toBe('');
		let t = state('', 0);
		t = t.update(openQuote(t)!).state;
		t = t.update({ selection: { anchor: 1 }, userEvent: 'select.pointer' }).state;
		expect(deleteQuotePair(t)).toBeNull();
		expect(overtypeQuote(t)).toBeNull();
	});
});
