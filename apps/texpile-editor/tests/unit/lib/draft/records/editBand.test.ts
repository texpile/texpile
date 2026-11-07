import { it, expect } from 'vitest';
import { changedBand } from '../../../../../src/lib/draft/records/editBand';

const font = { t: 'font', id: 3, name: 'ptmr8r', size: 10 };
function line(y: number, text: string) {
	return [
		{ t: 'pl', x: 72, y, w: 300, h: 7, d: 2, s: 7 },
		...[...text].map((ch, i) => ({ t: 'g', c: ch.charCodeAt(0), f: 3, x: 72 + i * 5, y }))
	];
}

// beamer reads a frame before typesetting it, so every line of the frame carries the frame's last source line
it('highlights the line an edit changed whatever source line it carries', () => {
	const before = [font, ...line(100, 'First line'), ...line(112, 'Second line'), ...line(124, 'Third line')];
	const after = [font, ...line(100, 'First line'), ...line(112, 'Second edited line'), ...line(124, 'Third line')];
	expect(changedBand(1, before, after)).toEqual({ page: 1, top: 105, bottom: 114, colL: 72, colR: 372 });
	expect(changedBand(1, before, before)).toBeNull();
});
