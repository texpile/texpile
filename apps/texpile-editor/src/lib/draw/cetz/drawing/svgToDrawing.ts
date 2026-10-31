// Typst's svg as the editor's drawing: every shape a part of the statement whose marker came before it, the markers
// themselves read for each statement's transform; svg is pt (= bp) with y down, the canvas y up
import type { DrawnPart, Drawing } from '$lib/draw/editor/drawing/drawing.types';
import { compose, scaleOf, type Matrix } from '$lib/draw/editor/drawing/matrix';
import type { SourceTransform } from '$lib/draw/editor/figure/geometry';
import { MARK_WIDTH } from '../source/instrument';
import { transformedPath } from './svgPath';

const FLIP: Matrix = [1, 0, 0, -1, 0, 0];
function round(v: number) {
	return +v.toFixed(3);
}
const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)="([^"]*)"/g;
// the red says which: 1 where a statement starts, 2 after its own turn
const MARK_COLOR = /^#0([12])([0-9a-f]{2})([0-9a-f]{2})$/i;

function attrsOf(text: string) {
	const out: Record<string, string> = {};
	for (const m of text.matchAll(ATTR)) out[m[1]] = m[2];
	return out;
}

function transformOf(text: string | undefined): Matrix {
	let m: Matrix = [1, 0, 0, 1, 0, 0];
	for (const t of (text ?? '').matchAll(/(matrix|translate|scale)\(([^)]*)\)/g)) {
		const n = t[2]
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number);
		const own: Matrix =
			t[1] === 'matrix'
				? (n as unknown as Matrix)
				: t[1] === 'translate'
					? [1, 0, 0, 1, n[0], n[1] ?? 0]
					: [n[0], 0, 0, n[1] ?? n[0], 0, 0];
		m = compose(m, own);
	}
	return m;
}

/** `#rrggbb`, `#rgb` or `#rrggbbaa`, with the alpha split off */
function colorOf(value: string | undefined): { css: string | null; alpha: number } {
	if (!value || value === 'none') return { css: null, alpha: 1 };
	const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
	return hex ? { css: `#${hex[1]}`, alpha: hex[2] ? parseInt(hex[2], 16) / 255 : 1 } : { css: value, alpha: 1 };
}

type Frame = { m: Matrix; fill: string | undefined };

/** the picture's own origin (marker 0's) becomes the canvas's, as pgf's is for TikZ */
type ReadSvg = { drawing: Drawing; transforms: Map<number, SourceTransform>; outer: Map<number, SourceTransform> };

export function svgToDrawing(svg: string): ReadSvg {
	const first = readSvg(svg, FLIP);
	const origin = first.transforms.get(0);
	if (!origin) return first;
	const [ox, oy] = [origin[4], origin[5]];
	const shifted = readSvg(svg, compose([1, 0, 0, 1, -ox, -oy], FLIP));
	return shifted;
}

function readSvg(svg: string, base: Matrix): ReadSvg {
	const parts: DrawnPart[] = [];
	const transforms = new Map<number, SourceTransform>();
	const outer = new Map<number, SourceTransform>();
	const unsupported = new Set<string>();

	// glyph outlines are defined before their use, in a `defs` of their own: typst.ts names the path, Typst's own
	// svg (tinymist's) a `symbol` around it
	const glyphs = new Map<string, string>();
	let symbol: string | null = null;
	for (const t of svg.matchAll(TAG)) {
		const a = attrsOf(t[3]);
		if (t[2] === 'symbol') symbol = t[1] ? null : (a.id ?? null);
		else if (t[2] === 'path' && a.class === 'outline_glyph' && a.id && a.d) glyphs.set(a.id, a.d);
		else if (t[2] === 'path' && symbol && a.d && !glyphs.has(symbol)) glyphs.set(symbol, a.d);
	}

	const stack: Frame[] = [{ m: base, fill: undefined }];
	let skipping = 0;
	let stmt = 0;
	let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];

	function addPath(d: string, a: Record<string, string>, frame: Frame) {
		const marker = a['stroke-width'] === MARK_WIDTH ? MARK_COLOR.exec(a.stroke ?? '') : null;
		const path = transformedPath(d, frame.m);
		if (marker) {
			stmt = parseInt(marker[2], 16) * 256 + parseInt(marker[3], 16);
			const [A, O, B] = path.points.slice(-3);
			const m: SourceTransform | null = A && O && B ? [A[0] - O[0], A[1] - O[1], B[0] - O[0], B[1] - O[1], O[0], O[1]] : null;
			if (m && marker[1] === '1') outer.set(stmt, m);
			if (m) transforms.set(stmt, m);
			return;
		}
		const fill = colorOf(a.fill ?? frame.fill ?? '#000000');
		const stroke = colorOf(a.stroke);
		// an invisible shape (the frame, a content's box) paints nothing and takes no clicks
		if (!fill.css && !stroke.css) return;
		if (a.fill?.startsWith('url(') || a.stroke?.startsWith('url(')) unsupported.add('gradient');
		const s = scaleOf(frame.m);
		// the box holds the whole line, as TeX's does: Typst's leaves out the half of a stroke outside its path
		const pad = stroke.css ? (Number(a['stroke-width'] ?? 1) * s) / 2 : 0;
		for (const [x, y] of path.points)
			[minX, minY, maxX, maxY] = [Math.min(minX, x - pad), Math.min(minY, y - pad), Math.max(maxX, x + pad), Math.max(maxY, y + pad)];
		parts.push({
			kind: 'path',
			stmt,
			clip: null,
			d: path.d,
			fill: fill.css,
			gradient: null,
			fillOpacity: fill.alpha * Number(a['fill-opacity'] ?? 1),
			evenOdd: a['fill-rule'] === 'evenodd',
			stroke: stroke.css,
			strokeWidth: round(Number(a['stroke-width'] ?? 1) * s),
			strokeOpacity: stroke.alpha * Number(a['stroke-opacity'] ?? 1),
			dash: a['stroke-dasharray']
				? a['stroke-dasharray']
						.split(/[\s,]+/)
						.map((v) => round(Number(v) * s))
						.join(' ')
				: null,
			dashOffset: 0,
			cap: (a['stroke-linecap'] as 'butt' | 'round' | 'square') ?? 'butt',
			join: (a['stroke-linejoin'] as 'miter' | 'round' | 'bevel') ?? 'miter'
		});
	}

	for (const t of svg.matchAll(TAG)) {
		const [, closing, name, rawAttrs, selfClosing] = t;
		if (name === 'defs' || name === 'style') {
			if (!selfClosing) skipping += closing ? -1 : 1;
			continue;
		}
		if (skipping > 0) continue;
		const a = attrsOf(rawAttrs);
		const top = stack.at(-1)!;
		if (name === 'g') {
			if (closing) stack.pop();
			else if (!selfClosing) stack.push({ m: compose(top.m, transformOf(a.transform)), fill: a.fill ?? top.fill });
			if (a['clip-path']) unsupported.add('clip');
			continue;
		}
		if (closing) continue;
		const frame = { m: compose(top.m, transformOf(a.transform)), fill: top.fill };
		if (name === 'path' && a.d) addPath(a.d, a, frame);
		else if (name === 'use') {
			const glyph = glyphs.get((a.href ?? a['xlink:href'] ?? '').slice(1));
			if (glyph) addPath(glyph, a, { ...frame, m: compose(frame.m, [1, 0, 0, 1, Number(a.x ?? 0), Number(a.y ?? 0)]) });
		} else if (name === 'image') unsupported.add('image');
	}

	const bbox = Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };
	return { drawing: { parts, clips: [], gradients: [], bbox, unsupported: [...unsupported] }, transforms, outer };
}
