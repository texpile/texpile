// the resolution a file names is carried into what the image tab writes; graphicx sizes by it, a canvas has none
type Resolution = { x: number; y: number };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function u32(b: Uint8Array, at: number): number {
	return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function put32(b: Uint8Array, at: number, v: number): void {
	b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at);
}

function isPng(b: Uint8Array): boolean {
	return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJfif(b: Uint8Array): boolean {
	return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(...b.subarray(6, 11)) === 'JFIF\0';
}

export function namedResolution(b: Uint8Array): Resolution | null {
	if (isPng(b)) {
		for (let at = 8; at + 12 <= b.length; at += 12 + u32(b, at)) {
			const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
			if (type === 'IDAT') return null;
			if (type === 'pHYs' && b[at + 16] === 1) return { x: u32(b, at + 8) * 0.0254, y: u32(b, at + 12) * 0.0254 };
		}
		return null;
	}
	if (isJfif(b)) {
		const unit = b[13];
		const x = (b[14] << 8) | b[15];
		const y = (b[16] << 8) | b[17];
		if (unit === 1) return { x, y };
		if (unit === 2) return { x: x * 2.54, y: y * 2.54 };
	}
	return null;
}

export function withResolution(b: Uint8Array, dpi: Resolution): Uint8Array {
	if (isPng(b) && String.fromCharCode(...b.subarray(12, 16)) === 'IHDR') {
		const chunk = new Uint8Array(21);
		put32(chunk, 0, 9);
		chunk.set([0x70, 0x48, 0x59, 0x73], 4);
		put32(chunk, 8, Math.round(dpi.x / 0.0254));
		put32(chunk, 12, Math.round(dpi.y / 0.0254));
		chunk[16] = 1;
		put32(chunk, 17, crc32(chunk.subarray(4, 17)));
		const at = 8 + 12 + u32(b, 8);
		const out = new Uint8Array(b.length + chunk.length);
		out.set(b.subarray(0, at));
		out.set(chunk, at);
		out.set(b.subarray(at), at + chunk.length);
		return out;
	}
	if (isJfif(b)) {
		const out = b.slice();
		out[13] = 1;
		out.set([(Math.round(dpi.x) >> 8) & 255, Math.round(dpi.x) & 255, (Math.round(dpi.y) >> 8) & 255, Math.round(dpi.y) & 255], 14);
		return out;
	}
	return b;
}
