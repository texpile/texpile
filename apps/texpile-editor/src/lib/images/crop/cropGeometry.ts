/** how much is cut from each side, as a fraction of the image's width or height */
export type Crop = { l: number; t: number; r: number; b: number };

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

export const UNCROPPED: Crop = { l: 0, t: 0, r: 0, b: 0 };

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** the crop after dragging `handle` by (dx, dy), fractions of the image; the box keeps at least `min` of each side */
export function dragCrop(start: Crop, handle: CropHandle, dx: number, dy: number, min: { x: number; y: number }): Crop {
	if (handle === 'move') {
		const mx = clamp(dx, -start.l, start.r);
		const my = clamp(dy, -start.t, start.b);
		return { l: start.l + mx, r: start.r - mx, t: start.t + my, b: start.b - my };
	}
	const next = { ...start };
	if (handle.includes('w')) next.l = clamp(start.l + dx, 0, 1 - start.r - min.x);
	if (handle.includes('e')) next.r = clamp(start.r - dx, 0, 1 - start.l - min.x);
	if (handle.includes('n')) next.t = clamp(start.t + dy, 0, 1 - start.b - min.y);
	if (handle.includes('s')) next.b = clamp(start.b - dy, 0, 1 - start.t - min.y);
	return next;
}

/** the same cut on the image turned a quarter, clockwise (`right`) or not */
export function turnCrop(c: Crop, dir: 'left' | 'right'): Crop {
	return dir === 'right' ? { l: c.b, t: c.l, r: c.t, b: c.r } : { l: c.t, t: c.r, r: c.b, b: c.l };
}

/** the same cut on the image mirrored across its vertical axis (`x`) or its horizontal one */
export function flipCrop(c: Crop, axis: 'x' | 'y'): Crop {
	return axis === 'x' ? { ...c, l: c.r, r: c.l } : { ...c, t: c.b, b: c.t };
}

export function isUncropped(c: Crop): boolean {
	return c.l === 0 && c.t === 0 && c.r === 0 && c.b === 0;
}
