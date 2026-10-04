import { it, expect } from 'vitest';
import { compareSuggestions } from '$lib/comments/suggestCompare';
import { carryGestures } from '$lib/comments/editGestures';

function suggested(before: string, after: string) {
	let n = 0;
	return compareSuggestions({
		before,
		after,
		pending: [],
		mode: 'suggesting',
		author: 'me',
		gestures: carryGestures([], before, after),
		whitespace: 'paragraphs',
		newId: () => `s${++n}`
	}).placed.map((s) => ({ quote: after.slice(s.from, s.to), restore: s.restore }));
}

// two suggestions, one for each end, let a reviewer reject the opening alone and leave a stray closing brace
it('makes bold over a long passage one suggestion', () => {
	const long =
		'This sentence is long enough that making all of it bold in the visual editor writes the opening of the bold command more than two hundred characters before its closing brace, which is the point here';
	const before = `Before it. ${long}. After it.\n`;
	const after = `Before it. \\textbf{${long}}. After it.\n`;
	const placed = suggested(before, after);
	expect(placed).toHaveLength(1);
	const at = after.indexOf(placed[0].quote);
	expect(after.slice(0, at) + placed[0].restore + after.slice(at + placed[0].quote.length)).toBe(before);
});

it('keeps the changes of a replace-all across a long stretch apart', () => {
	const before = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} says colour twice, colour, and goes on for a while to be long.`).join(
		'\n\n'
	);
	expect(suggested(before, before.replace(/colour/g, 'color')).length).toBeGreaterThan(2);
});
