// the snapshots were taken from the web engine, which drew these pictures as lualatex does (paths, transforms and
// gradients the same, glyphs within 0.1 bp); the images one is lualatex's own
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../engines/lualatexEngine';
import { boundsOf } from '$lib/draw/editor/canvas/drawing/partBounds';
import type { Drawing } from '$lib/draw/editor/drawing/drawing.types';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import { canvasPoint } from '$lib/draw/editor/figure/geometry';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { pgfTransform } from '$lib/draw/tikz/renderTikz';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';

if (process.env.REQUIRE_LUALATEX && !hasLualatex) throw new Error('REQUIRE_LUALATEX is set, but lualatex is not on the PATH');

const PREAMBLE = '\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{arrows.meta,calc,positioning,shapes.geometric}';

/** a solid red PNG */
function png(w: number, h: number) {
	const table = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (b: Buffer) => {
		let c = 0xffffffff;
		for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const out = Buffer.alloc(12 + data.length);
		out.writeUInt32BE(data.length, 0);
		body.copy(out, 4);
		out.writeUInt32BE(crc(body), 8 + data.length);
		return out;
	};
	const head = Buffer.alloc(13);
	head.writeUInt32BE(w, 0);
	head.writeUInt32BE(h, 4);
	head.set([8, 2, 0, 0, 0], 8);
	const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array.from({ length: w }, () => [255, 0, 0]).flat()])));
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return Buffer.concat([signature, chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const round = (s: string) => s.replace(/-?\d+\.\d+/g, (n) => (Math.round(Number(n) * 10) / 10).toFixed(1));

/** a drawing in the terms that must not move: paths by statement, gradients, where glyphs and images sit */
function summary(drawing: Drawing) {
	return {
		paths: drawing.parts.flatMap((p) => (p.kind === 'path' ? [`${p.stmt} ${round(p.d)}`] : [])),
		placed: drawing.parts.flatMap((p) =>
			p.kind === 'glyph' || p.kind === 'image' ? [`${p.stmt} ${p.kind} ${round(p.matrix.map((v) => v.toFixed(1)).join(' '))}`] : []
		),
		gradients: drawing.gradients.map((g) => round(JSON.stringify(g))),
		unsupported: drawing.unsupported
	};
}

describe.skipIf(!hasLualatex)('drawing what lualatex typeset', () => {
	useLualatex();
	const render = (source: string, preamble = PREAMBLE, root?: string) =>
		drawWithLualatex(preamble, instrumentPicture(source, readPicture(source)!), root);

	it('keeps each part with its statement and draws Type1 math glyphs from the real font', async () => {
		const src = '\\begin{tikzpicture}\n  \\draw[blue] (0,0) rectangle (2,1);\n  \\node at (1,2) {$-x$};\n\\end{tikzpicture}';
		const result = await render(src);
		const drawing = buildDrawing(result);
		const rect = drawing.parts.find((p) => p.kind === 'path' && p.stmt === 1);
		expect(rect).toMatchObject({ stroke: 'rgb(0 0 255)', fill: null });
		// 2cm wide in bp, starting at pgf's origin
		expect(rect!.kind === 'path' && rect!.d.startsWith('M0 0')).toBe(true);
		const glyphs = drawing.parts.filter((p) => p.kind === 'glyph');
		expect(glyphs.map((g) => g.stmt)).toEqual([2, 2]);

		const outlines = createFontOutlines(readLualatexFile);
		const fonts = await outlines.loadFonts(result.fonts);
		const minus = glyphs.find((g) => g.kind === 'glyph' && g.code === 0)!;
		expect(minus).toBeDefined();
		expect(outlines.outline(fonts.get(minus.kind === 'glyph' ? minus.font : -1)!, 0)).toMatch(/^M/);
	});

	it('draws T1 text, whose EC fonts TeX Live may have no outlines for, from Latin Modern', async () => {
		const src = '\\begin{tikzpicture}\\node {a};\\end{tikzpicture}';
		const result = await render(src, `${PREAMBLE}\\usepackage[T1]{fontenc}`);
		const glyph = buildDrawing(result).parts.find((p) => p.kind === 'glyph');
		const fonts = await createFontOutlines(readLualatexFile).loadFonts(result.fonts);
		expect(glyph?.kind === 'glyph' && fonts.get(glyph.font)?.size).toBeGreaterThan(0);
	});

	it('keeps a blend mode with what it is drawn in', async () => {
		const src = '\\begin{tikzpicture}[blend group=color dodge]\\fill[red] (0,0) circle (1);\\end{tikzpicture}';
		const fill = buildDrawing(await render(src)).parts.find((p) => p.kind === 'path' && p.fill);
		expect(fill?.blend).toBe('color-dodge');
	});

	it("reaches a tree's end when its root has a tikz= of its own", async () => {
		const src = '\\begin{forest}\n[A, tikz={\\draw (.north) -- ++(0,1);} [B] [C]]\n\\end{forest}';
		const marks = (await render(src, `${PREAMBLE}\\usepackage{forest}`)).marks.map((m) => m.i);
		expect(marks).toContain(0);
	});

	it("keeps a dash pattern's phase, which sets dashes of two colors apart", async () => {
		const src = '\\begin{tikzpicture}\\draw[dash pattern=on 2pt off 2pt, dash phase=2pt] (0,0) -- (1,0);\\end{tikzpicture}';
		const line = buildDrawing(await render(src)).parts.find((p) => p.kind === 'path' && p.stroke);
		expect(line?.kind === 'path' && [line.dash, line.dashOffset]).toEqual(['1.993 1.993', 1.993]);
	});

	it('draws a transparency group at the opacity it was placed with', async () => {
		const src =
			'\\begin{tikzpicture}\n  \\begin{scope}[transparency group, opacity=0.5]\n    \\fill[red] (0,0) circle (1);\n    \\fill[blue, opacity=0.5] (1,0) circle (1);\n  \\end{scope}\n\\end{tikzpicture}';
		const drawing = buildDrawing(await render(src));
		const fills = drawing.parts.filter((p) => p.kind === 'path' && p.fill);
		expect(fills.map((p) => p.kind === 'path' && [p.stmt, p.fill, p.fillOpacity])).toEqual([
			[2, 'rgb(255 0 0)', 0.5],
			[3, 'rgb(0 0 255)', 0.25]
		]);
		expect(drawing.unsupported).toEqual([]);
	});

	it('puts a point where it is drawn under the picture unit vectors and the statement own scale', async () => {
		const src =
			'\\begin{tikzpicture}[x=2cm, y=2cm]\n  \\draw (1,0) -- (2,0);\n  \\draw[scale=2, shift={(1,1)}] (1,0) -- (2,0);\n\\end{tikzpicture}';
		const result = await render(src);
		const drawing = buildDrawing(result);
		const transforms = new Map(result.marks.map((m) => [m.i, pgfTransform(m.m)]));
		for (const i of [1, 2]) {
			const line = boundsOf(
				drawing.parts.filter((p) => p.stmt === i),
				() => 10
			)!;
			const [x1] = canvasPoint(1, 0, transforms.get(i)!);
			const [x2] = canvasPoint(2, 0, transforms.get(i)!);
			expect(x1).toBeCloseTo(line.x1 + 0.2, 0);
			expect(x2).toBeCloseTo(line.x2 - 0.2, 0);
		}
	});

	it.each([
		'\\begin{tikzpicture}\n  \\draw[thick, blue] (0,0) rectangle (2,1);\n  \\node[draw, circle] at (3,1) {$x^2$};\n  \\draw[->] (0,0) .. controls (1,2) .. (3,1);\n\\end{tikzpicture}',
		'\\begin{tikzpicture}[x=2cm, y=1.5cm]\n  \\draw[red, scale=2] (1,0) -- (2,1);\n  \\begin{scope}[shift={(1,1)}, rotate=30]\n    \\fill[green!50!black, opacity=0.5] (0,0) circle (0.5);\n  \\end{scope}\n\\end{tikzpicture}',
		'\\begin{tikzpicture}\n  \\shade[left color=red, right color=blue] (0,0) rectangle (2,1);\n  \\shade[ball color=blue!60] (3,0.5) circle (0.5);\n  \\shade[top color=yellow, bottom color=green] (4,0) rectangle (5,1);\n\\end{tikzpicture}'
	])('draws shapes, transforms and shadings as before: %#', async (src) => {
		const result = await render(src);
		expect(result.errors).toEqual([]);
		expect(summary(buildDrawing(result))).toMatchSnapshot();
		expect(result.marks.map((m) => `${m.i} ${pgfTransform(m.m).map((v) => v.toFixed(2))}`)).toMatchSnapshot();
	});

	it('places images and turns text as before', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'draw-doc-'));
		writeFileSync(join(dir, 'red.png'), png(40, 20));
		const src =
			'\\begin{tikzpicture}\n  \\node at (0,0) {\\includegraphics[width=2cm]{red}};\n  \\node at (3,0) {\\rotatebox{30}{Ab}};\n  \\node at (5,0) {\\scalebox{2}[1]{c}};\n\\end{tikzpicture}';
		const result = await render(src, '\\documentclass{article}\\usepackage{graphicx}\\usepackage{tikz}', dir);
		expect(result.errors).toEqual([]);
		const drawing = summary(buildDrawing(result));
		expect(drawing.placed.filter((p) => p.includes('image'))).toHaveLength(1);
		expect(drawing).toMatchSnapshot();
		expect(result.recs.find((r) => r.t === 'i')).toMatchObject({ p: join(dir, 'red.png') });
	});
});
