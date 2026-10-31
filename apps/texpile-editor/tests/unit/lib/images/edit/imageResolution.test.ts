import { describe, expect, it } from 'vitest';
import { namedResolution, withResolution } from '$lib/images/edit/imageResolution';

function png(chunks: [string, number[]][]): Uint8Array {
	const out: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	for (const [type, data] of chunks) {
		const n = data.length;
		out.push(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0);
	}
	return new Uint8Array(out);
}

describe('an edited image keeps the resolution its file named', () => {
	it('writes a 300 dpi PNG back as 300 dpi', () => {
		const written = png([
			['IHDR', new Array(13).fill(0)],
			['IDAT', []]
		]);
		expect(namedResolution(written)).toBeNull();
		const kept = namedResolution(withResolution(written, { x: 300, y: 300 }));
		expect([Math.round(kept!.x), Math.round(kept!.y)]).toEqual([300, 300]);
	});

	it('sets a JPEG’s JFIF density', () => {
		const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
		expect(namedResolution(withResolution(jfif, { x: 150, y: 150 }))).toEqual({ x: 150, y: 150 });
	});
});
