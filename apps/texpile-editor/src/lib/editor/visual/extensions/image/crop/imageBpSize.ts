// an image's size as graphicx reads it, in bp: pixels at the resolution the file names, else 72 dpi
import { pdfPageSize } from '../pdfImageSource';

type Resolution = { x: number; y: number };

function u32(b: Uint8Array, at: number): number {
	return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function u16(b: Uint8Array, at: number): number {
	return (b[at] << 8) | b[at + 1];
}

function pngResolution(b: Uint8Array): Resolution | null {
	for (let at = 8; at + 12 <= b.length;) {
		const length = u32(b, at);
		const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
		if (type === 'IDAT') return null;
		// unit 1 is per meter; unit 0 is an aspect ratio only
		if (type === 'pHYs' && b[at + 16] === 1) return { x: u32(b, at + 8) * 0.0254, y: u32(b, at + 12) * 0.0254 };
		at += 12 + length;
	}
	return null;
}

function jpegResolution(b: Uint8Array): Resolution | null {
	for (let at = 2; at + 4 <= b.length && b[at] === 0xff; at += 2 + u16(b, at + 2)) {
		if (b[at + 1] !== 0xe0) continue;
		if (String.fromCharCode(...b.subarray(at + 4, at + 9)) !== 'JFIF\0') return null;
		const unit = b[at + 11];
		const x = u16(b, at + 12);
		const y = u16(b, at + 14);
		if (unit === 1) return { x, y };
		if (unit === 2) return { x: x * 2.54, y: y * 2.54 };
		return null;
	}
	return null;
}

export function resolutionOf(bytes: Uint8Array): Resolution {
	const png = bytes[0] === 0x89 && bytes[1] === 0x50;
	const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
	const found = png ? pngResolution(bytes) : jpeg ? jpegResolution(bytes) : null;
	return found && found.x > 0 && found.y > 0 ? found : { x: 72, y: 72 };
}

export async function imageBpSize(url: string, pixels: { w: number; h: number }): Promise<{ w: number; h: number }> {
	const page = pdfPageSize(url);
	if (page) return page;
	const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
	const dpi = resolutionOf(bytes);
	return { w: (pixels.w * 72) / dpi.x, h: (pixels.h * 72) / dpi.y };
}
