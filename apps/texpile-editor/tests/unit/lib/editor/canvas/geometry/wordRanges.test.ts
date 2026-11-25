import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { withTrailingSpaces, wordRangeIn } from '$lib/editor/canvas/geometry/wordRanges';

const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('golf hotel  india end'))]);

function doubleClickAt(at: number) {
	const $pos = doc.resolve(at);
	const word = wordRangeIn($pos, { pos: at, affinity: 1 }, 'en');
	const grown = withTrailingSpaces($pos, word);
	return doc.textBetween(grown.from, grown.to);
}

describe('a double click on Windows', () => {
	it('takes the spaces after the word', () => {
		expect(doubleClickAt(8)).toBe('hotel  ');
	});

	it('takes nothing more at the end of the text or on the spaces themselves', () => {
		expect(doubleClickAt(20)).toBe('end');
		expect(doubleClickAt(12)).toBe('  ');
	});
});
