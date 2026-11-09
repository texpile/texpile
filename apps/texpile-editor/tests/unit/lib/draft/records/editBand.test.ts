import { it, expect } from 'vitest';
import { editBand, shippedPage } from '../../../../../src/lib/draft/records/editBand';

const font = { t: 'font', id: 3, name: 'ptmr8r', size: 10 };
function line(y: number, text: string) {
	const records: object[] = [{ t: 'pl', x: 72, y, w: 300, h: 7, d: 2, s: 7 }];
	let x = 72;
	for (const ch of text) {
		if (ch !== ' ') records.push({ t: 'g', c: ch.charCodeAt(0), f: 3, x, y, w: 5 });
		x += ch === ' ' ? 3 : 5;
	}
	return records;
}
function page(...lines: string[]) {
	return [font, ...lines.flatMap((text, i) => line(100 + 12 * i, text))];
}

// beamer reads a frame before typesetting it, so every line of the frame carries the frame's last source line
it('highlights the line an edit changed whatever source line it carries', () => {
	const before = page('First line', 'Second line', 'Third line');
	const after = page('First line', 'Second edited line', 'Third line');
	expect(editBand([shippedPage(1, before, after)], false)).toEqual({ page: 1, top: 105, bottom: 114, colL: 72, colR: 372 });
	expect(editBand([shippedPage(1, before, before)], true)).toBeNull();
});

// typing at the end of a paragraph that runs onto page 2 re-broke its lines on page 1
it('highlights the page holding the typed words, not the page re-broken before it', () => {
	const pages = [shippedPage(1, page('alpha beta gamma', 'delta epsi-'), page('alpha beta gamma', 'delta'))];
	expect(editBand(pages, false)).toBeNull();
	pages.push(shippedPage(2, page('lon zeta eta.', 'Next para.'), page('epsilon zeta eta', 'theta.', 'Next para.')));
	expect(editBand(pages, false)).toEqual({ page: 2, top: 93, bottom: 114, colL: 72, colR: 372 });
});

it('waits for the run to end when words were added at the end of what it shipped', () => {
	const pages = [shippedPage(1, page('one two'), page('one two three'))];
	expect(editBand(pages, false)).toBeNull();
	expect(editBand(pages, true)).toEqual({ page: 1, top: 93, bottom: 102, colL: 72, colR: 372 });
});
