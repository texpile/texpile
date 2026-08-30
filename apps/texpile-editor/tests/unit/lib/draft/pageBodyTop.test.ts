import { describe, expect, it } from 'vitest';
import { pageBodyTop } from '$lib/draft/heuristics/pageBodyTop';

// The decision under test: where does a page's text area start, read back from a page that has
// text? Content leaving the last page lands on a page the compile never produced, so its top
// cannot be measured -- it is inferred from the landing rule on a page that exists. Every case
// here is one that would put landed lines at the wrong height, or invent a top for a page that
// cannot supply one.
type Rec = Record<string, unknown>;
const W = 345;
const colL = 72;
const colR = 417;
// a body line: page-absolute baseline y, height above it
const pl = (y: number, h: number, over: Partial<Rec> = {}): Rec => ({ t: 'pl', x: colL, y, h, d: 2, w: W, ...over });

describe('pageBodyTop', () => {
	it('seats the first baseline by the landing rule, not by its own height', () => {
		// \topskip wins for an ordinary line, so two pages whose first lines differ in height
		// still report the same body top -- which is the point: it is page geometry, not content
		expect(pageBodyTop([pl(110, 7)], colL, colR, W, 10)).toBe(100);
		expect(pageBodyTop([pl(110, 4)], colL, colR, W, 10)).toBe(100);
	});

	it('gives way to a first line taller than \\topskip', () => {
		// the rule is max(): a line whose height exceeds \topskip pushes itself down, and reading
		// it as \topskip would place every landed line 4pt too high
		expect(pageBodyTop([pl(110, 14)], colL, colR, W, 10)).toBe(96);
	});

	it('ignores full-width material above the body', () => {
		// a title block or a starred figure spans \textwidth and starts higher than body text
		// does; measuring the top off one puts the whole landed run above the text area
		const recs = [pl(60, 20, { w: 469, x: 36 }), pl(110, 7)];
		expect(pageBodyTop(recs, colL, colR, W, 10)).toBe(100);
	});

	it('reads the topmost body line rather than the first emitted', () => {
		// records arrive in engine emission order, which a float or a margin note reorders
		expect(pageBodyTop([pl(300, 7), pl(110, 7), pl(200, 7)], colL, colR, W, 10)).toBe(100);
	});

	it('refuses a page that shows no body line', () => {
		// no top to infer: the caller drops to provisional rather than guessing one
		expect(pageBodyTop([], colL, colR, W, 10)).toBeNull();
		expect(pageBodyTop([pl(60, 20, { w: 469, x: 36 })], colL, colR, W, 10)).toBeNull();
		// a line outside the column band belongs to another column, not this one's top
		expect(pageBodyTop([pl(110, 7, { x: 450 })], colL, colR, W, 10)).toBeNull();
	});
});
