/* eslint-disable @typescript-eslint/naming-convention -- S is the page scale factor, named after the transform it applies */
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
type Font = { ot?: any; t1?: { outlineForSlot(slot: number): Outline | null }; size: number } | null;
type OutlineCmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
/** a glyph's shape in its own units, one object per glyph of a font: the painter keeps what it builds from it */
export type Outline = { commands: OutlineCmd[] };
export type DrawOp =
	// drawn by moving to x, y and scaling by sx, sy; hairline: the thin stroke an opentype glyph is weighted with
	| { kind: 'glyph'; outline: Outline; x: number; y: number; sx: number; sy: number; fill: string; hairline: boolean }
	| { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
	| { kind: 'image'; x: number; y: number; w: number; h: number; rec: Rec }
	// raw-PDF drawing region (tikz/pgfplots, \rotatebox): shown as pixels cropped
	// from the reconcile PDF; rec keeps the pt-space geometry for the crop key
	| { kind: 'pixels'; x: number; y: number; w: number; h: number; rec: Rec }
	| { kind: 'missing'; x: number; y: number; w: number; h: number; rec: Rec };

export type DrawList = {
	ops: DrawOp[];
	stats: { notdef: number; glyphsDrawn: number };
};

// an opentype glyph's outline in font units, made once
const otOutlines = new WeakMap<object, Outline>();
function otOutline(glyph: any, unitsPerEm: number): Outline {
	let found = otOutlines.get(glyph);
	if (!found) {
		found = { commands: glyph.getPath(0, 0, unitsPerEm).commands };
		otOutlines.set(glyph, found);
	}
	return found;
}

export function buildDrawList(
	records: Rec[],
	fontFor: (id: number) => Font,
	S: number,
	opts: { glyphFill?: string; ruleFill?: string } = {}
): DrawList {
	const glyphFill = opts.glyphFill || '#000';
	const ruleFill = opts.ruleFill || '#000';
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
			// the font expansion of the line, as a stretch about the glyph's origin
			const stretch = 1 + (r.ef || 0) / 1e6;
			if (f.t1) {
				const outline = f.t1.outlineForSlot(r.c);
				if (!outline) {
					notdef++; // unknown slot/glyph: skip, never guess
					continue;
				}
				const s = f.size * S;
				ops.push({ kind: 'glyph', outline, x: X, y: Y, sx: s * stretch, sy: s, fill: r.col || glyphFill, hairline: false });
			} else {
				const glyph = r.gi != null ? f.ot.glyphs.get(r.gi) : f.ot.charToGlyph(String.fromCodePoint(r.c));
				if (!glyph || glyph.index === 0) {
					notdef++;
					continue;
				}
				const s = (f.size * S) / f.ot.unitsPerEm;
				ops.push({
					kind: 'glyph',
					outline: otOutline(glyph, f.ot.unitsPerEm),
					x: X,
					y: Y,
					sx: s * stretch,
					sy: s,
					fill: r.col || glyphFill,
					hairline: true
				});
			}
			glyphsDrawn++;
		} else if (r.t === 'rule') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			ops.push({ kind: 'rect', x, y, w, h, fill: r.col || ruleFill });
		} else if (r.t === 'image') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			ops.push({ kind: 'image', x, y, w, h, rec: r });
		} else if (r.t === 'lit') {
			const x = r.x * S,
				y = (r.y - r.h) * S,
				w = r.w * S,
				h = (r.h + r.d) * S;
			ops.push({ kind: 'pixels', x, y, w, h, rec: r });
		}
	}

	return { ops, stats: { notdef, glyphsDrawn } };
}
