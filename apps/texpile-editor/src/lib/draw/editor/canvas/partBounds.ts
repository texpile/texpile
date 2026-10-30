import type { Box } from '../figure/geometry';
import type { ClipRegion, DrawnPart } from '../drawing/drawing.types';
import { visitPathExtent } from './pathExtent';

function pathBox(d: string) {
	const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
	visitPathExtent(d, (x, y) => {
		b.x1 = Math.min(b.x1, x);
		b.y1 = Math.min(b.y1, y);
		b.x2 = Math.max(b.x2, x);
		b.y2 = Math.max(b.y2, y);
	});
	return b;
}

/** a statement's extent in bp from its parts: paths as far as their outline reaches, a shading as far as what clips it,
 *  image boxes, and glyph boxes at their size */
export function boundsOf(parts: DrawnPart[], fontSize: (font: number) => number, clips: ClipRegion[] = []): Box | null {
	let x1 = Infinity;
	let y1 = Infinity;
	let x2 = -Infinity;
	let y2 = -Infinity;
	function add(x: number, y: number) {
		if (x < x1) x1 = x;
		if (x > x2) x2 = x;
		if (y < y1) y1 = y;
		if (y > y2) y2 = y;
	}
	for (const p of parts) {
		const clip = p.kind === 'path' && p.gradient && p.clip ? clips.find((c) => c.id === p.clip) : null;
		if (clip && p.kind === 'path') {
			// a shading fills a box much larger than the path it is clipped to
			const [s, c] = [pathBox(p.d), pathBox(clip.d)];
			add(Math.max(s.x1, c.x1), Math.max(s.y1, c.y1));
			add(Math.min(s.x2, c.x2), Math.min(s.y2, c.y2));
		} else if (p.kind === 'path') {
			const pad = p.stroke ? p.strokeWidth / 2 : 0;
			visitPathExtent(p.d, (x, y) => {
				add(x - pad, y - pad);
				add(x + pad, y + pad);
			});
		} else if (p.kind === 'image') {
			const [a, b, c, d, e, f] = p.matrix;
			for (const [u, v] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1]
			])
				add(a * u + c * v + e, b * u + d * v + f);
		} else {
			const [a, b, c, d, e, f] = p.matrix;
			const s = fontSize(p.font);
			// a glyph spans about 0.6em across and from 0.25em below to 0.75em above its baseline
			for (const [gx, gy] of [
				[0, 0.25 * s],
				[0.6 * s, 0.25 * s],
				[0, -0.75 * s],
				[0.6 * s, -0.75 * s]
			])
				add(a * gx + c * gy + e, b * gx + d * gy + f);
		}
	}
	return x1 === Infinity ? null : { x1, y1, x2, y2 };
}
