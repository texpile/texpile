// the EXIF orientation of a JPEG, which the browser applies and TeX does not
import { flipCrop, turnCrop, type Crop } from './cropGeometry';

const ORIENTATION_TAG = 0x0112;

function orientationIn(b: Uint8Array, tiff: number, end: number): number {
	const little = b[tiff] === 0x49;
	if (!little && b[tiff] !== 0x4d) return 1;
	function u16(at: number): number {
		return little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1];
	}
	function u32(at: number): number {
		return (little ? u16(at) | (u16(at + 2) << 16) : (u16(at) << 16) | u16(at + 2)) >>> 0;
	}
	const ifd = tiff + u32(tiff + 4);
	if (ifd + 2 > end) return 1;
	for (let k = 0; k < u16(ifd); k++) {
		const entry = ifd + 2 + k * 12;
		if (entry + 12 > end) return 1;
		if (u16(entry) !== ORIENTATION_TAG) continue;
		const value = u16(entry + 8);
		return value >= 1 && value <= 8 ? value : 1;
	}
	return 1;
}

export function exifOrientation(b: Uint8Array): number {
	if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
	let at = 2;
	while (at + 4 <= b.length && b[at] === 0xff) {
		const marker = b[at + 1];
		if (marker === 0xda) return 1;
		const length = (b[at + 2] << 8) | b[at + 3];
		if (marker === 0xe1 && String.fromCharCode(...b.subarray(at + 4, at + 10)) === 'Exif\0\0') {
			return orientationIn(b, at + 10, Math.min(at + 2 + length, b.length));
		}
		at += 2 + length;
	}
	return 1;
}

export function shownCrop(c: Crop, orientation: number): Crop {
	switch (orientation) {
		case 2:
			return flipCrop(c, 'x');
		case 3:
			return turnCrop(turnCrop(c, 'right'), 'right');
		case 4:
			return flipCrop(c, 'y');
		case 5:
			return { l: c.t, t: c.l, r: c.b, b: c.r };
		case 6:
			return turnCrop(c, 'right');
		case 7:
			return { l: c.b, t: c.r, r: c.t, b: c.l };
		case 8:
			return turnCrop(c, 'left');
		default:
			return c;
	}
}

export function storedCrop(c: Crop, orientation: number): Crop {
	// a quarter turn undoes the other way; every other orientation undoes itself
	return shownCrop(c, orientation === 6 ? 8 : orientation === 8 ? 6 : orientation);
}
