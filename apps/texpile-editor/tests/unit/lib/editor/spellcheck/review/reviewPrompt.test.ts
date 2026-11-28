import { expect, test } from 'vitest';
import { parseRewrite, type RewriteRequest } from '$lib/editor/spellcheck/review/reviewPrompt';

const request: RewriteRequest = {
	text: '[bcd] We has a result. [fgh] It hold.',
	sentences: [
		{ target: 0, from: 0, to: 15, id: 'bcd' },
		{ target: 0, from: 16, to: 24, id: 'fgh' }
	]
};

test('each id takes its sentence, without bold marks or a note after a blank line', () => {
	const answer = '**[bcd]** We have a result. [fgh] It holds.\n\nI fixed two verbs.';
	expect(parseRewrite(answer, request)).toEqual(
		new Map([
			['bcd', 'We have a result.'],
			['fgh', 'It holds.']
		])
	);
});

test('an answer with no ids is null so it can be asked again', () => {
	expect(parseRewrite('We have a result. It holds.', request)).toBeNull();
});
