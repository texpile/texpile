import type { FigureFrame } from '../figure/figureLanguage';
import { canvasPoint, sourcePoint, type SourceTransform } from '../figure/geometry';
import type { PictureRect } from './viewport.svelte';
import { snapTo } from '../figure/numbers';
import { BP_PER_CM } from '../figure/lengthUnits';

export type Sheet = PictureRect & { framed: boolean };
export type SheetHandle = { key: string; axes: 'x' | 'y' | 'xy'; at: [number, number] };

/** the sheet in bp: the frame when the picture has one, else the box the engine made */
export function sheetOf(frame: FigureFrame | null, m: SourceTransform, bbox: PictureRect | null): Sheet | null {
	if (frame) {
		const [x1, y1] = canvasPoint(frame.x1, frame.y1, m);
		const [x2, y2] = canvasPoint(frame.x2, frame.y2, m);
		return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), framed: true };
	}
	return bbox ? { ...bbox, framed: false } : null;
}

/** the handles that size a framed sheet; its corner at x1 y1 stays, as the picture starts there */
export function sheetHandlesOf(s: Sheet): SheetHandle[] {
	return [
		{ key: 'fx', axes: 'x', at: [s.x + s.w, s.y + s.h / 2] },
		{ key: 'fy', axes: 'y', at: [s.x + s.w / 2, s.y + s.h] },
		{ key: 'fxy', axes: 'xy', at: [s.x + s.w, s.y + s.h] }
	];
}

function roundOut(v: number, up: boolean) {
	return (up ? Math.ceil(v * 2) : Math.floor(v * 2)) / 2;
}

/** the engine's natural box in bp, rounded out to the half grid in the picture's own coordinates */
export function naturalFrame(b: PictureRect, m: SourceTransform): FigureFrame {
	const [u1, v1] = sourcePoint(b.x, b.y, m);
	const [u2, v2] = sourcePoint(b.x + b.w, b.y + b.h, m);
	return {
		x1: roundOut(Math.min(u1, u2), false),
		y1: roundOut(Math.min(v1, v2), false),
		x2: roundOut(Math.max(u1, u2), true),
		y2: roundOut(Math.max(v1, v2), true)
	};
}

/** the frame sized out to the grid point nearest `at` on the axes dragged; x1 y1 stays where the picture starts */
export function frameResized(frame: FigureFrame, axes: 'x' | 'y' | 'xy', [u, v]: readonly [number, number], step: number): FigureFrame {
	const [su, sv] = [snapTo(u, step), snapTo(v, step)];
	return {
		...frame,
		x2: axes.includes('x') ? Math.max(su, frame.x1 + step) : frame.x2,
		y2: axes.includes('y') ? Math.max(sv, frame.y1 + step) : frame.y2
	};
}

/** paper cm per unit of the picture's own coordinates, across and up, which its scale or x and y set */
export function cmPerUnit(m: SourceTransform): [number, number] {
	return [Math.hypot(m[0], m[1]) / BP_PER_CM, Math.hypot(m[2], m[3]) / BP_PER_CM];
}
