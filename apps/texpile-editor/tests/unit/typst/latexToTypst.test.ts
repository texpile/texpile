// The return half of the mathfield bridge. It used to run through MathLive's own serializer, which
// needed a live offscreen mathfield (so a whole ProseMirror plugin existed to call it early, while
// MathLive was certainly loaded) and rewrote every equation it touched: `1/3` came back `(1)/(3)`,
// and \mathrm{d} came back a bare italic `d`.
import { describe, it, expect } from 'vitest';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { latexToTypst } from '$lib/languages/typst/visual/serialize/latexToTypst';

/** an inline equation as the converter builds it: latex as content, typst + latexOrig as attrs */
function mathDoc(typst: string, latexOrig: string, latexNow = latexOrig) {
	const math = typSchema.nodes.inline_math.create({ typst, latexOrig }, typSchema.text(latexNow));
	return typSchema.nodes.doc.create(null, typSchema.nodes.paragraph.create(null, math));
}

describe('latexToTypst', () => {
	it('keeps the differential and the fraction MathLive rewrote', () => {
		expect(latexToTypst(String.raw`\int_{0}^{1} x^{2} \mathrm{d} x = \frac{1}{3}`)).toBe('integral_0^1 x^2 dif x = 1/3');
	});

	it('is a pure function, so no mathfield has to exist to call it', () => {
		expect(latexToTypst(String.raw`a - b`)).toBe('a - b');
	});

	it('returns null rather than guessing when it cannot write the input', () => {
		expect(latexToTypst('')).toBeNull();
	});
});

describe('serializing an equation', () => {
	it('re-emits the stored source byte-for-byte while it is untouched', () => {
		// odd spacing on purpose: an untouched equation must never be reformatted
		expect(serializeToTypst(mathDoc('integral_0^1  x dif x', String.raw`\int_{0}^{1} x \mathrm{d} x`))).toBe('$integral_0^1  x dif x$');
	});

	it('converts once the latex has been edited away from its parse-time value', () => {
		expect(serializeToTypst(mathDoc('x', 'x', String.raw`\frac{a}{b}`))).toBe('$a/b$');
	});
});
