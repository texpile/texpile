import { describe, expect, it } from 'vitest';
import { sourceMathText } from '$lib/editor/source/extensions/math-search/sourceMathInsert';

describe('a math search pick as source text', () => {
	it('drops the places to type into and puts the caret in the first empty one', () => {
		expect(sourceMathText('\\frac{#@}{#0}', '', '')).toEqual({ text: '\\frac{}{}', caret: 6 });
		expect(sourceMathText('\\frac{#@}{#0}', 'a', '')).toEqual({ text: '\\frac{a}{}', caret: 9 });
	});

	it('keeps a command from running into the letter after it', () => {
		expect(sourceMathText('\\alpha', '', 'x')).toEqual({ text: '\\alpha ', caret: 7 });
		expect(sourceMathText('\\alpha', '', '^')).toEqual({ text: '\\alpha', caret: 6 });
	});
});
