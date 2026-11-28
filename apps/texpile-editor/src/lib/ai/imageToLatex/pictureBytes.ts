// The picture as the AI service gets it: the part picked, at a size every service reads, as base64 PNG

/** a part of the picture, in its own pixels */
export type PictureRegion = { x: number; y: number; w: number; h: number };

// the longest side Anthropic reads without scaling down; a small formula is drawn larger so its symbols stay apart
const LONGEST_SIDE = 1568;
const SMALL_SIDE = 600;
// an A4 page drawn at twice its size is past this, a figure usually is not
const LARGE_SIDE = 1500;

export async function pictureBitmap(blob: Blob): Promise<ImageBitmap> {
	try {
		return await createImageBitmap(blob);
	} catch {
		// an SVG, which createImageBitmap does not take
		const url = URL.createObjectURL(blob);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			return await createImageBitmap(img);
		} finally {
			URL.revokeObjectURL(url);
		}
	}
}

export function scaleFor(w: number, h: number): number {
	const long = Math.max(w, h);
	return Math.min(LONGEST_SIDE / long, long < SMALL_SIDE ? 2 : 1);
}

export async function pictureForService(bitmap: ImageBitmap, region: PictureRegion | null): Promise<{ mediaType: string; base64: string }> {
	const r = region ?? { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
	const k = scaleFor(r.w, r.h);
	const canvas = new OffscreenCanvas(Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k)));
	const ctx = canvas.getContext('2d')!;
	// a transparent screenshot of black text reads as black on black
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
	const png = await canvas.convertToBlob({ type: 'image/png' });
	const bytes = new Uint8Array(await png.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return { mediaType: 'image/png', base64: btoa(binary) };
}

/** a scan or a page is too much to read at once: the writer picks the part first */
export function wantsRegion(bitmap: ImageBitmap, regionFirst: 'large' | 'never'): boolean {
	return regionFirst === 'large' && Math.max(bitmap.width, bitmap.height) > LARGE_SIDE;
}

function clamp(v: number, most: number): number {
	return Math.min(Math.max(v, 0), most);
}

/** the box between two points of the shown picture, in the picture's own pixels; a click with no drag is no box */
export function regionBetween(
	a: { x: number; y: number },
	b: { x: number; y: number },
	shown: { w: number; h: number },
	size: { w: number; h: number }
): PictureRegion | null {
	const k = size.w / shown.w;
	const [x0, x1] = [clamp(Math.min(a.x, b.x), shown.w), clamp(Math.max(a.x, b.x), shown.w)];
	const [y0, y1] = [clamp(Math.min(a.y, b.y), shown.h), clamp(Math.max(a.y, b.y), shown.h)];
	if (x1 - x0 < 6 || y1 - y0 < 6) return null;
	return { x: Math.round(x0 * k), y: Math.round(y0 * k), w: Math.round((x1 - x0) * k), h: Math.round((y1 - y0) * k) };
}
