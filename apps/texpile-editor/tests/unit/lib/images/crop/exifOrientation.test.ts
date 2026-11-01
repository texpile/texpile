import { describe, expect, it } from 'vitest';
import { exifOrientation, shownCrop, storedCrop } from '$lib/images/crop/exifOrientation';

function jpegWithOrientation(value: number, little: boolean): Uint8Array {
	const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
	const u32 = (v: number) => (little ? [v & 255, 0, 0, 0] : [0, 0, 0, v & 255]);
	const tiff = [
		...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
		...u16(42),
		...u32(8),
		...u16(1),
		...u16(0x0112),
		...u16(3),
		...u32(1),
		...u16(value),
		0,
		0,
		...u32(0)
	];
	const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
	const length = body.length + 2;
	return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255, ...body, 0xff, 0xda, 0, 2]);
}

describe('exifOrientation', () => {
	it('reads the tag in either byte order, 1 for a file without it', () => {
		expect(exifOrientation(jpegWithOrientation(6, true))).toBe(6);
		expect(exifOrientation(jpegWithOrientation(8, false))).toBe(8);
		expect(exifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
		expect(exifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
	});

	it('places a cut on the image as shown, and back', () => {
		const onFile = { l: 0.1, t: 0.2, r: 0.3, b: 0.05 };
		for (let o = 1; o <= 8; o++) expect(storedCrop(shownCrop(onFile, o), o)).toEqual(onFile);
		// stored upright and shown turned right: the file's left edge is the top on screen
		expect(shownCrop(onFile, 6).t).toBe(onFile.l);
		// shown turned left: the file's left edge is the bottom on screen
		expect(shownCrop(onFile, 8).b).toBe(onFile.l);
		// shown mirrored: the file's left edge is on the right
		expect(shownCrop(onFile, 2).r).toBe(onFile.l);
		// shown across its main diagonal: the file's left edge is the top, its top the left
		expect(shownCrop(onFile, 5)).toMatchObject({ t: onFile.l, l: onFile.t });
		// shown across the other diagonal: the file's left edge is the bottom, its top the right
		expect(shownCrop(onFile, 7)).toMatchObject({ b: onFile.l, r: onFile.t });
	});
});
