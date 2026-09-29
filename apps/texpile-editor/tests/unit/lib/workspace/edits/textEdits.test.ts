import { describe, expect, it } from 'vitest';
import { applyEdits, insertedSpans, invertEdits, mapEnd, mapStart, type TextEdit } from '$lib/workspace/edits/textEdits';

const TEXT = 'a softmax, then softmax.';
const EDITS: TextEdit[] = [
	{ from: 2, to: 9, insert: 'sigmoid function' },
	{ from: 16, to: 23, insert: 'tanh' }
];
const AFTER = 'a sigmoid function, then tanh.';

describe('edits', () => {
	it('make the changed text, and their inverse takes it back', () => {
		expect(applyEdits(TEXT, EDITS)).toBe(AFTER);
		expect(applyEdits(AFTER, invertEdits(TEXT, EDITS))).toBe(TEXT);
	});

	it('name what they put in, in the changed text', () => {
		expect(insertedSpans(EDITS).map((s) => AFTER.slice(s.from, s.to))).toEqual(['sigmoid function', 'tanh']);
	});
});

describe('mapping a range through edits', () => {
	const map = (from: number, to: number) => AFTER.slice(mapStart(from, EDITS), mapEnd(to, EDITS));

	it('moves a range after a change by what it added or took away', () => {
		expect(map(TEXT.indexOf('then'), TEXT.indexOf('then') + 4)).toBe('then');
	});

	it('keeps a range on a match it covers, and grows it over one it starts or ends inside', () => {
		expect(map(2, 9)).toBe('sigmoid function');
		expect(map(4, 15)).toBe('sigmoid function, then');
		expect(map(0, 20)).toBe('a sigmoid function, then tanh');
	});

	it('leaves text put in right at an edge outside the range', () => {
		const insertAt = (pos: number): TextEdit[] => [{ from: pos, to: pos, insert: '> ' }];
		expect(mapStart(2, insertAt(2))).toBe(4);
		expect(mapEnd(9, insertAt(9))).toBe(9);
	});
});
