import { describe, expect, it } from 'vitest';
import { resolutionOf } from '$lib/editor/visual/extensions/image/crop/imageBpSize';

function chunk(type: string, data: number[]): number[] {
	const n = data.length;
	return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

describe('resolutionOf', () => {
	it('reads a png pHYs in dpi, and 72 without one', () => {
		const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const ihdr = chunk('IHDR', new Array(13).fill(0));
		// 5906 per meter is 150 dpi
		const phys = chunk('pHYs', [0, 0, 0x17, 0x12, 0, 0, 0x17, 0x12, 1]);
		expect(Math.round(resolutionOf(new Uint8Array([...signature, ...ihdr, ...phys])).x)).toBe(150);
		expect(resolutionOf(new Uint8Array([...signature, ...ihdr, ...chunk('IDAT', [])]))).toEqual({ x: 72, y: 72 });
	});
});
