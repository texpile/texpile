// Chromium paints box edges, borders, rules, the selection and the caret on whole device pixels; text keeps its subpixel x
import type { DocRect } from '../contracts/layoutTypes';

/** the context's scale and offset to device pixels, read once per replay */
export type DevicePixels = { readonly sx: number; readonly sy: number; readonly ox: number; readonly oy: number };

const IDENTITY: DevicePixels = { sx: 1, sy: 1, ox: 0, oy: 0 };

/** the frame's transform holds a fractional offset where the column is centered, so snapping happens past it */
export function devicePixelsOf(ctx: CanvasRenderingContext2D): DevicePixels {
	const matrix = ctx.getTransform?.();
	return matrix?.a && matrix.d ? { sx: matrix.a, sy: matrix.d, ox: matrix.e, oy: matrix.f } : IDENTITY;
}

/** edges rounded to device pixels as Chromium's pixel-snapped rects; a rect with a size keeps at least one pixel */
export function snapRect(rect: DocRect, px: DevicePixels): DocRect {
	const left = Math.round(rect.x * px.sx + px.ox);
	const top = Math.round(rect.y * px.sy + px.oy);
	const right = Math.max(left + (rect.width > 0 ? 1 : 0), Math.round((rect.x + rect.width) * px.sx + px.ox));
	const bottom = Math.max(top + (rect.height > 0 ? 1 : 0), Math.round((rect.y + rect.height) * px.sy + px.oy));
	return { x: (left - px.ox) / px.sx, y: (top - px.oy) / px.sy, width: (right - left) / px.sx, height: (bottom - top) / px.sy };
}

/** a border or rule width in whole device pixels, at least one */
export function snapWidth(width: number, scale: number): number {
	return width > 0 ? Math.max(1, Math.round(width * scale)) / scale : 0;
}
