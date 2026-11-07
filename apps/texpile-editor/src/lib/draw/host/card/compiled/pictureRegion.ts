import type { SyncBox } from '$lib/workspace/synctex';

// bp from the page's top left
export type PageRegion = { page: number; x: number; y: number; w: number; h: number };

// a label can sit past the box TeX gives the picture
export const REGION_PAD = 8;

export function pictureLines(text: string, from: number, to: number): { first: number; last: number } {
	return { first: lineAt(text, from), last: lineAt(text, Math.max(from, to - 1)) };
}

function lineAt(text: string, offset: number): number {
	return text.slice(0, offset).split('\n').length;
}

export function regionFromBoxes(boxes: readonly SyncBox[], pad = REGION_PAD): PageRegion | null {
	const page = boxes[0]?.page;
	if (page === undefined) return null;
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const b of boxes) {
		if (b.page !== page) continue;
		const x = b.bl ?? b.x;
		const baseline = b.bv ?? b.y;
		left = Math.min(left, x);
		right = Math.max(right, x + b.W);
		top = Math.min(top, baseline - b.H);
		bottom = Math.max(bottom, baseline);
	}
	if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
	return { page, x: left - pad, y: top - pad, w: right - left + 2 * pad, h: bottom - top + 2 * pad };
}

export function clampRegion(region: PageRegion, pageW: number, pageH: number): PageRegion | null {
	const x = Math.max(0, region.x);
	const y = Math.max(0, region.y);
	const w = Math.min(pageW, region.x + region.w) - x;
	const h = Math.min(pageH, region.y + region.h) - y;
	return w > 0 && h > 0 ? { page: region.page, x, y, w, h } : null;
}

export function compiledPictureKey(pdfPath: string, mtimeMs: number, region: PageRegion, scale: number): string {
	const r = [region.x, region.y, region.w, region.h].map((n) => n.toFixed(1)).join(',');
	return `${pdfPath}|${Math.round(mtimeMs)}|${region.page}|${r}|${scale}`;
}
