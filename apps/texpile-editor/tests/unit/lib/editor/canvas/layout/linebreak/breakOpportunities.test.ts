import { it, expect } from 'vitest';
import { breakOpportunities } from '$lib/editor/canvas/layout/linebreak/breakOpportunities';

// each piece a line may end after, with what kind of end it is
function pieces(text: string): string[] {
	let start = 0;
	return breakOpportunities(text).map(({ at, dropFrom, kind }) => {
		const piece = `${text.slice(start, dropFrom)}:${kind}`;
		start = at;
		return piece;
	});
}

it('ends a line after spaces, after a hyphen inside a word, at a newline, and never at a no-break space', () => {
	expect(pieces('self-esteem is\nFigure 1 here ')).toEqual(['self-:joint', 'esteem:spaces', 'is:required', 'Figure 1:spaces', 'here:end']);
});

it('ends a line between Chinese characters but never before a closing mark, and holds a word to a node view', () => {
	expect(pieces('很长的一句话。测试「引号」')).toEqual([
		'很:ideographic',
		'长:ideographic',
		'的:ideographic',
		'一:ideographic',
		'句:ideographic',
		'话。:ideographic',
		'测:ideographic',
		'试:ideographic',
		'「引:ideographic',
		'号」:end'
	]);
	expect(pieces('wordxword 中x中')).toEqual(['wordxword:spaces', '中:ideographic', 'x:ideographic', '中:end']);
});

it('ends a line between Thai words from the dictionary, with nothing between them', () => {
	expect(pieces('สวัสดีครับ ยินดีต้อนรับ')).toEqual(['สวัสดี:word', 'ครับ:spaces', 'ยินดี:word', 'ต้อนรับ:end']);
});
