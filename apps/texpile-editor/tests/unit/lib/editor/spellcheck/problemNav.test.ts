import { describe, expect, it } from 'vitest';
import { nextProblem } from '$lib/editor/spellcheck/problemNav';

const spans = [
	{ from: 30, to: 35 },
	{ from: 5, to: 9 },
	{ from: 50, to: 52 }
];
const caret = (at: number) => ({ from: at, to: at });

describe('nextProblem', () => {
	it('goes to the first problem after the caret, whatever order they came in', () => {
		expect(nextProblem(spans, caret(10), 1)).toEqual({ from: 30, to: 35 });
		expect(nextProblem(spans, caret(0), 1)).toEqual({ from: 5, to: 9 });
	});

	it('steps past the problem the last jump selected', () => {
		expect(nextProblem(spans, { from: 30, to: 35 }, 1)).toEqual({ from: 50, to: 52 });
		expect(nextProblem(spans, { from: 30, to: 35 }, -1)).toEqual({ from: 5, to: 9 });
	});

	it('wraps around at either end', () => {
		expect(nextProblem(spans, caret(60), 1)).toEqual({ from: 5, to: 9 });
		expect(nextProblem(spans, caret(2), -1)).toEqual({ from: 50, to: 52 });
	});

	it('has nowhere to go without problems', () => {
		expect(nextProblem([], caret(0), 1)).toBeNull();
	});
});
