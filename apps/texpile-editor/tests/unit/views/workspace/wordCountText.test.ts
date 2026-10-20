import { describe, expect, it } from 'vitest';
import { charactersText, selectedText, wordsText } from '../../../../src/views/workspace/wordCountText';

describe('word count text', () => {
	it('says one word, not 1 words', () => {
		expect(wordsText(1)).toBe('1 word');
		expect(wordsText(3)).toBe('3 words');
		expect(charactersText(1)).toBe('1 character');
		expect(selectedText(1, 1)).toBe('1 of 1 word');
	});
});
