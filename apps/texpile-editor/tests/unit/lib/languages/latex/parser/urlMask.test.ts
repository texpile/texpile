import { describe, expect, it } from 'vitest';
import { endsInComment } from '$lib/languages/latex/parser/urlMask';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

describe('a % inside a URL argument is not a comment', () => {
	it('is not the end of the text', () => {
		expect(endsInComment('see \\nolinkurl{http://a.b/c%20d}')).toBe(false);
		expect(endsInComment('see \\url{http://a.b/%41}')).toBe(false);
		expect(endsInComment('see \\url{http://a.b/%41} % note')).toBe(true);
		expect(endsInComment('50\\% sure')).toBe(false);
		expect(endsInComment('half % of it')).toBe(true);
	});

	it('adds no line to the paragraph that ends in it', () => {
		const src = 'First ends \\nolinkurl{http://a.b/c%20d}\n\nSecond ends \\url{http://x.y/%41}\n\nThird.\n';
		expect(serializeToLatex(latexToProseMirror(src).doc)).not.toMatch(/\n\n\n/);
	});
});
