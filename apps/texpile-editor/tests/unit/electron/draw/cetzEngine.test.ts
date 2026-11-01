import { describe, expect, it } from 'vitest';
import { drawWithTinymist, hasTinymist, useTinymist } from '../../lib/draw/engines/tinymistEngine';

const PICTURE =
	'#set page(width: auto, height: auto, margin: 0pt)\n#import "@preview/cetz:0.4.2"\n#cetz.canvas({\n  import cetz.draw: *\n  circle((0, 0), radius: 1)\n  content((0, 2), [Hi $x^2$])\n})\n';

describe.skipIf(!hasTinymist)('the warm tinymist', () => {
	useTinymist();

	it('draws a CeTZ picture from the packages it is given, and the next one in the same server', async () => {
		const first = await drawWithTinymist(PICTURE);
		expect(first.errors).toEqual([]);
		expect(first.svg).toContain('<svg');
		const again = await drawWithTinymist(PICTURE.replace('radius: 1', 'radius: 1.5'));
		expect(again.errors).toEqual([]);
		expect(again.svg).not.toBe(first.svg);
	});

	it('says where an error is, and what a package it does not have is called', async () => {
		const broken = await drawWithTinymist(PICTURE.replace('circle((0, 0), radius: 1)', 'circle((0, 0), radius: 1'));
		expect(broken.svg).toBeNull();
		expect(broken.errorLines[0]).toBe(5);
		const missing = await drawWithTinymist('#import "@preview/nosuchpackage:0.1.0"\n');
		expect(missing.errors.join()).toContain('nosuchpackage');
	});
});
