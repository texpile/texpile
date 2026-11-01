import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { imageFidelity } from '$lib/images/edit/imageFidelity';

function pngChunk(type: string, data: Uint8Array): Buffer {
	const head = Buffer.alloc(4);
	head.writeUInt32BE(data.length);
	return Buffer.concat([head, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function png(depth: number, ...chunks: Buffer[]): Uint8Array {
	const ihdr = Buffer.alloc(13);
	ihdr[8] = depth;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', ihdr),
		...chunks,
		pngChunk('IDAT', Buffer.alloc(1))
	]);
}

function iccp(profile: string): Buffer {
	return pngChunk('iCCP', Buffer.concat([Buffer.from('icc\0\0', 'latin1'), deflateSync(Buffer.from(profile, 'latin1'))]));
}

function jpeg(components: number, precision = 8, app: number[] = []): Uint8Array {
	return new Uint8Array([0xff, 0xd8, ...app, 0xff, 0xc0, 0, 8, precision, 0, 1, 0, 1, components, 0xff, 0xda]);
}

function jpegProfile(profile: string): number[] {
	const body = [...Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), ...Buffer.from(profile, 'latin1')];
	return [0xff, 0xe2, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
}

function webp(...chunks: [string, number[]][]): Uint8Array {
	const parts = chunks.flatMap(([type, data]) => [...Buffer.from(type), data.length, 0, 0, 0, ...data, ...(data.length % 2 ? [0] : [])]);
	return new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...parts]);
}

describe('what a canvas would lose', () => {
	it('an animated or 16-bit PNG, a CMYK or 12-bit JPEG, an animated WebP', async () => {
		expect((await imageFidelity(png(16))).lost).toBe(true);
		expect((await imageFidelity(png(8, pngChunk('acTL', Buffer.alloc(8))))).lost).toBe(true);
		expect((await imageFidelity(jpeg(4))).lost).toBe(true);
		expect((await imageFidelity(jpeg(3, 12))).lost).toBe(true);
		expect((await imageFidelity(webp(['ANIM', [0, 0, 0, 0, 0, 0]]))).lost).toBe(true);
	});

	it('nothing of a plain still image', async () => {
		for (const image of [png(8), jpeg(3), jpeg(1), webp(['VP8 ', [0, 0]])]) {
			expect(await imageFidelity(image)).toEqual({ lost: false, toSrgb: false });
		}
	});

	it('the color of a profile other than sRGB, read from each format', async () => {
		expect((await imageFidelity(png(8, iccp('desc Display P3')))).toSrgb).toBe(true);
		expect((await imageFidelity(png(8, iccp('desc sRGB IEC61966-2.1')))).toSrgb).toBe(false);
		expect((await imageFidelity(jpeg(3, 8, jpegProfile('Adobe RGB (1998)')))).toSrgb).toBe(true);
		expect((await imageFidelity(jpeg(3, 8, jpegProfile('s\0R\0G\0B\0')))).toSrgb).toBe(false);
		expect((await imageFidelity(webp(['ICCP', [...Buffer.from('Display P3')]]))).toSrgb).toBe(true);
	});
});
