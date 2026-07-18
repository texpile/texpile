// Turns engine records into canvas draw-ops -- nothing else. Framework-agnostic (no
// DOM/opentype import) so the same geometry logic could be pixel-tested headlessly.
// Coords are TeX pt throughout (paper dims and glyph coords come from the same engine,
// so no bp/pt conversion).
//
// fontFor(id) -> { ot, size } | null   (ot = a parsed opentype.js font; size in pt)
// S = pixels per TeX pt.

// deliberately loose: opentype.js glyph/path objects aren't worth full typings here
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;
// ot: an opentype.js font (otf/ttf). t1: a parsed classic Type1 font (see draft/type1) --
// the record's `c` is then the font's encoding slot, resolved by the t1 font itself.
type Font = { ot?: any; t1?: { pathForSlot(slot: number, x: number, y: number, sizePx: number): any }; size: number } | null;
export type DrawOp =
	| { kind: 'glyph'; path: any; fill: string }
	| { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
	| { kind: 'image'; x: number; y: number; w: number; h: number; rec: Rec }
	// raw-PDF drawing region (tikz/pgfplots, \rotatebox): shown as pixels cropped
	// from the reconcile PDF; rec keeps the pt-space geometry for the crop key
	| { kind: 'pixels'; x: number; y: number; w: number; h: number; rec: Rec }
	| { kind: 'missing'; x: number; y: number; w: number; h: number; rec: Rec };

export type DrawList = {
	ops: DrawOp[];
	bbox: { minX: number; minY: number; maxX: number; maxY: number };
	stats: { notdef: number; glyphsDrawn: number };
};

export function buildDrawList(
	records: Rec[],
	fontFor: (id: number) => Font,
	S: number,
	opts: { glyphFill?: string; ruleFill?: string } = {}
): DrawList {
	const glyphFill = opts.glyphFill || '#000';
	const ruleFill = opts.ruleFill || '#000';
	const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	const grow = (x: number, y: number) => {
		if (x < bbox.minX) bbox.minX = x;
		if (y < bbox.minY) bbox.minY = y;
		if (x > bbox.maxX) bbox.maxX = x;
		if (y > bbox.maxY) bbox.maxY = y;
	};
	const ops: DrawOp[] = [];
	let notdef = 0;
	let glyphsDrawn = 0;

	for (const r of records) {
		if (r.t === 'g') {
			const f = fontFor(r.f);
			const X = (r.x + (r.xo || 0)) * S;
			const Y = (r.y - (r.yo || 0)) * S;
			if (!f || (!f.ot && !f.t1)) {
				notdef++;
				const fsz = f && f.size ? f.size : 10;
				ops.push({ kind: 'missing', x: X, y: Y - fsz * 0.7 * S, w: (r.w || 0) * S, h: fsz * S, rec: r });
				continue;
			}
			let p: any;
			if (f.t1) {
				p = f.t1.pathForSlot(r.c, X, Y, f.size * S);
				if (!p) {
					notdef++; // unknown slot/glyph: skip, never guess
					continue;
				}
			} else {
				const glyph = r.gi != null ? f.ot.glyphs.get(r.gi) : f.ot.charToGlyph(String.fromCodePoint(r.c));
				if (!glyph || glyph.index === 0) {
					notdef++;
					continue;
				}
				p = glyph.getPath(X, Y, f.size * S);
			}
			glyphsDrawn++;
			const sc = 1 + (r.ef || 0) / 1e6;
			if (sc !== 1) for (const c of p.commands) for (const k of ['x', 'x1', 'x2']) if (c[k] !== undefined) c[k] = X + (c[k] - X) * sc;
			const bb = p.getBoundingBox();
			grow(bb.x1, bb.y1);
			grow(bb.x2, bb.y2);
			ops.push({ kind: 'glyph', path: p, fill: r.col || glyphFill });
		} else if (r.t === 'rule') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			grow(x, y);
			grow(x + w, y + h);
			ops.push({ kind: 'rect', x, y, w, h, fill: r.col || ruleFill });
		} else if (r.t === 'image') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			grow(x, y);
			grow(x + w, y + h);
			ops.push({ kind: 'image', x, y, w, h, rec: r });
		} else if (r.t === 'lit') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			grow(x, y);
			grow(x + w, y + h);
			ops.push({ kind: 'pixels', x, y, w, h, rec: r });
		}
	}

	return { ops, bbox, stats: { notdef, glyphsDrawn } };
}
