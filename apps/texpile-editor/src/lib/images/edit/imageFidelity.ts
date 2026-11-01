// what a canvas would lose of an image: it holds one still frame of 8-bit sRGB
import { m } from '$lib/paraglide/messages';
import { basename } from '$lib/workspace/fileSystem';
import type { ImageUse } from '../uses/imageUses';
import { isEditableImage } from './imageEditSession.svelte';

/** `lost`: animation, depth or CMYK a write would destroy; `toSrgb`: a profile a write would convert away from */
export type ImageFidelity = { lost: boolean; toSrgb: boolean };

export const noColorLoss: ImageFidelity = { lost: false, toSrgb: false };

function asciiAt(b: Uint8Array, at: number, length: number): string {
	return String.fromCharCode(...b.subarray(at, at + length));
}

function u32(b: Uint8Array, at: number): number {
	return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function namesSrgb(profile: Uint8Array): boolean {
	const text = String.fromCharCode(...profile.subarray(0, 8192));
	return text.includes('sRGB') || text.includes('s\0R\0G\0B');
}

async function inflated(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function pngFidelity(b: Uint8Array): Promise<ImageFidelity> {
	const found = { lost: b[24] === 16, toSrgb: false };
	for (let at = 8; at + 8 <= b.length; at += 12 + u32(b, at)) {
		const type = asciiAt(b, at + 4, 4);
		if (type === 'IDAT') break;
		if (type === 'acTL') found.lost = true;
		if (type !== 'iCCP') continue;
		const body = b.subarray(at + 8, at + 8 + u32(b, at));
		const profile = await inflated(body.subarray(body.indexOf(0) + 2)).catch(() => new Uint8Array());
		found.toSrgb = !namesSrgb(profile);
	}
	return found;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegFidelity(b: Uint8Array): ImageFidelity {
	const found = { lost: false, toSrgb: false };
	let at = 2;
	while (at + 4 <= b.length && b[at] === 0xff && b[at + 1] !== 0xda) {
		const length = (b[at + 2] << 8) | b[at + 3];
		if (SOF.has(b[at + 1])) found.lost = b[at + 4] !== 8 || b[at + 9] === 4;
		if (b[at + 1] === 0xe2 && asciiAt(b, at + 4, 12) === 'ICC_PROFILE\0') found.toSrgb = !namesSrgb(b.subarray(at + 18, at + 2 + length));
		at += 2 + length;
	}
	return found;
}

function webpFidelity(b: Uint8Array): ImageFidelity {
	const found = { lost: false, toSrgb: false };
	for (let at = 12; at + 8 <= b.length;) {
		const size = b[at + 4] | (b[at + 5] << 8) | (b[at + 6] << 16) | (b[at + 7] << 24);
		const type = asciiAt(b, at, 4);
		if (type === 'ANIM') found.lost = true;
		if (type === 'ICCP') found.toSrgb = !namesSrgb(b.subarray(at + 8, at + 8 + size));
		at += 8 + size + (size & 1);
	}
	return found;
}

export async function imageFidelity(b: Uint8Array): Promise<ImageFidelity> {
	if (asciiAt(b, 1, 3) === 'PNG') return pngFidelity(b);
	if (b[0] === 0xff && b[1] === 0xd8) return jpegFidelity(b);
	if (asciiAt(b, 0, 4) === 'RIFF' && asciiAt(b, 8, 4) === 'WEBP') return webpFidelity(b);
	return noColorLoss;
}

export async function readImageFidelity(url: string): Promise<ImageFidelity> {
	try {
		return await imageFidelity(new Uint8Array(await (await fetch(url)).arrayBuffer()));
	} catch {
		return noColorLoss;
	}
}

export function whyNoEdit(path: string, guest: boolean, fidelity: ImageFidelity, uses: ImageUse[]): string | null {
	if (guest) return m.unavailable_guest();
	if (!isEditableImage(path)) return m.image_edit_formats();
	if (fidelity.lost) return m.image_edit_still();
	const cropped = uses.find((u) => u.cropped);
	return cropped ? m.image_edit_cropped({ file: basename(cropped.path) }) : null;
}
