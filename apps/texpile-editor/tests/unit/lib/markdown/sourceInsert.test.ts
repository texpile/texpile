import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection, type TransactionSpec } from '@codemirror/state';
import {
	computeToggleDelim,
	computeHeadingLine,
	computeListLines,
	computeQuoteLines,
	computeFence,
	computeLink,
	computeImage,
	computeMathBlock,
	computeTableSkeleton,
	computeHr
} from '$lib/languages/markdown/source/sourceInsert';

function state(doc: string, anchor: number, head = anchor) {
	return EditorState.create({ doc, selection: EditorSelection.range(anchor, head) });
}
function apply(s: EditorState, spec: TransactionSpec) {
	return s.update(spec).state.doc.toString();
}

describe('computeToggleDelim', () => {
	it('wraps a selection', () => {
		const s = state('hello world', 0, 5);
		expect(apply(s, computeToggleDelim(s, '**'))).toBe('**hello** world');
	});
	it('unwraps a selection that includes the delimiters', () => {
		const s = state('**hello** world', 0, 9);
		expect(apply(s, computeToggleDelim(s, '**'))).toBe('hello world');
	});
	it('unwraps when delimiters sit just outside the selection', () => {
		const s = state('**hello** world', 2, 7);
		expect(apply(s, computeToggleDelim(s, '**'))).toBe('hello world');
	});
	it('adds italics to a bold word instead of taking its bold away', () => {
		const inside = state('a **bold** b', 4, 8);
		expect(apply(inside, computeToggleDelim(inside, '*'))).toBe('a ***bold*** b');
		const whole = state('a **bold** b', 2, 10);
		expect(apply(whole, computeToggleDelim(whole, '*'))).toBe('a ***bold*** b');
		const both = state('a ***both*** b', 5, 9);
		expect(apply(both, computeToggleDelim(both, '*'))).toBe('a **both** b');
	});
	it('empty cursor inserts a pair, second invoke removes it', () => {
		const s = state('ab', 1);
		const once = s.update(computeToggleDelim(s, '*')).state;
		expect(once.doc.toString()).toBe('a**b');
		expect(once.selection.main.head).toBe(2); // between the pair
		expect(apply(once, computeToggleDelim(once, '*'))).toBe('ab');
	});
	it('handles multiple cursors right-to-left', () => {
		const s = EditorState.create({
			doc: 'one two',
			selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]),
			extensions: EditorState.allowMultipleSelections.of(true)
		});
		expect(apply(s, computeToggleDelim(s, '**'))).toBe('**one** **two**');
	});
});

describe('computeHeadingLine', () => {
	it('sets, changes and toggles off a heading', () => {
		let s = state('title', 2);
		s = s.update(computeHeadingLine(s, 2)).state;
		expect(s.doc.toString()).toBe('## title');
		s = s.update(computeHeadingLine(s, 3)).state;
		expect(s.doc.toString()).toBe('### title');
		s = s.update(computeHeadingLine(s, 3)).state;
		expect(s.doc.toString()).toBe('title');
	});
	it('level 0 strips any heading', () => {
		const s = state('#### deep', 3);
		expect(apply(s, computeHeadingLine(s, 0))).toBe('deep');
	});
});

describe('computeListLines', () => {
	it('marks selected lines as a bullet list, second invoke strips', () => {
		let s = state('one\ntwo', 0, 7);
		s = s.update(computeListLines(s, 'bullet')).state;
		expect(s.doc.toString()).toBe('- one\n- two');
		s = s.update({ selection: EditorSelection.range(0, s.doc.length) }).state;
		s = s.update(computeListLines(s, 'bullet')).state;
		expect(s.doc.toString()).toBe('one\ntwo');
	});
	it('numbers ordered lines sequentially and skips blanks', () => {
		const s = state('one\n\ntwo', 0, 8);
		expect(apply(s, computeListLines(s, 'ordered'))).toBe('1. one\n\n2. two');
	});
	it('strips mixed existing numbering', () => {
		const s = state('1. one\n2) two', 0, 13);
		expect(apply(s, computeListLines(s, 'ordered'))).toBe('one\ntwo');
	});
});

describe('computeImage', () => {
	it('inserts a skeleton with the path selected', () => {
		const s = state('', 0);
		const spec = computeImage(s);
		const next = s.update(spec).state;
		expect(next.doc.toString()).toBe('![alt](image.png)');
		expect(next.doc.sliceString(next.selection.main.from, next.selection.main.to)).toBe('image.png');
	});
	it('uses the selection as alt text', () => {
		const s = state('figure one', 0, 10);
		expect(apply(s, computeImage(s))).toBe('![figure one](image.png)');
	});
});

describe('computeQuoteLines', () => {
	it('quotes all selected lines, then unquotes', () => {
		let s = state('a\nb', 0, 3);
		s = s.update(computeQuoteLines(s)).state;
		expect(s.doc.toString()).toBe('> a\n> b');
		s = s.update({ selection: EditorSelection.range(0, s.doc.length) }).state;
		expect(apply(s, computeQuoteLines(s))).toBe('a\nb');
	});
});

describe('block inserts', () => {
	it('fence wraps the selection and grows past inner backticks', () => {
		const s = state('code with ``` inside', 0, 20);
		const out = apply(s, computeFence(s));
		expect(out.startsWith('````\n')).toBe(true);
		expect(out).toContain('code with ``` inside\n````');
	});
	it('link selects the url placeholder', () => {
		const s = state('click me', 0, 5);
		const next = s.update(computeLink(s)).state;
		expect(next.doc.toString()).toBe('[click](url) me');
		expect(next.doc.sliceString(next.selection.main.from, next.selection.main.to)).toBe('url');
	});
	it('math block wraps', () => {
		const s = state('x^2', 0, 3);
		expect(apply(s, computeMathBlock(s))).toBe('$$\nx^2\n$$\n');
	});
	it('table skeleton lands after the current line', () => {
		const s = state('para', 2);
		const out = apply(s, computeTableSkeleton(s));
		expect(out).toBe('para\n\n| Column | Column |\n| --- | --- |\n|  |  |\n');
	});
	it('hr lands after the current line', () => {
		const s = state('para', 2);
		expect(apply(s, computeHr(s))).toBe('para\n\n---\n');
	});
});
