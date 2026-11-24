// a reader for the 8-bit RGB and RGBA PNGs of looks/chrome, enough to measure a bar in them
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export type Pixels = { width: number; height: number; at(x: number, y: number): readonly [number, number, number] };

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function readPng(path: string): Pixels {
	const file = readFileSync(path);
	const width = file.readUInt32BE(16);
	const height = file.readUInt32BE(20);
	const channels = file[25] === 6 ? 4 : 3;
	const chunks: Buffer[] = [];
	for (let at = 8; at < file.length;) {
		const length = file.readUInt32BE(at);
		if (file.toString('latin1', at + 4, at + 8) === 'IDAT') chunks.push(file.subarray(at + 8, at + 8 + length));
		at += 12 + length;
	}
	const data = inflateSync(Buffer.concat(chunks));
	const stride = width * channels;
	const out = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = data[y * (stride + 1)];
		for (let i = 0; i < stride; i++) {
			const raw = data[y * (stride + 1) + 1 + i];
			const left = i >= channels ? out[y * stride + i - channels] : 0;
			const up = y ? out[(y - 1) * stride + i] : 0;
			const upLeft = y && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
			const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
			out[y * stride + i] = (raw + predictor) & 255;
		}
	}
	return {
		width,
		height,
		at: (x, y) => [out[y * stride + x * channels], out[y * stride + x * channels + 1], out[y * stride + x * channels + 2]]
	};
}

/** the longest run along a row of pixels that differ from the corner's ground by more than `distance` */
export function longestRun(pixels: Pixels, y: number, distance = 150): { from: number; length: number } {
	const ground = pixels.at(0, 0);
	let best = { from: 0, length: 0 };
	let start = 0;
	for (let x = 0; x <= pixels.width; x++) {
		const far = x < pixels.width && pixels.at(x, y).reduce((sum, c, i) => sum + Math.abs(c - ground[i]), 0) > distance;
		if (far) continue;
		if (x - start > best.length) best = { from: start, length: x - start };
		start = x + 1;
	}
	return best;
}
