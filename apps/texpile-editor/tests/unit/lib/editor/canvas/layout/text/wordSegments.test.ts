import { describe, expect, it } from 'vitest';
import { LEAF_CHARACTER, segmentWords } from '$lib/editor/canvas/layout/text/wordSegments';

describe('segmentWords', () => {
	it('counts an inline leaf as one word of its own, even glued to letters', () => {
		const text = `see${LEAF_CHARACTER}now, x`;
		const words = segmentWords(text)
			.filter((segment) => segment.word)
			.map((segment) => text.slice(segment.from, segment.to));
		expect(words).toEqual(['see', LEAF_CHARACTER, 'now', 'x']);
	});
});
