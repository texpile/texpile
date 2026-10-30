import type { EngineRecord, EngineResult } from '$lib/draw/tikz/tikzResult';
import { compose, type Matrix } from '$lib/draw/editor/drawing/matrix';
import { BP_PER_PT } from '$lib/draw/editor/figure/lengthUnits';
import type { Drawing, Gradient } from '$lib/draw/editor/drawing/drawing.types';
import { cssColor, rgbOf, roundCoordinate } from './pdfColors';
import { PdfGraphics } from './pdfGraphics';
import { shadingStops } from './shadings';

const RASTER = /\.(png|jpe?g)$/i;

type ColorStackRecord = Extract<EngineRecord, { t: 'c' }>;
type BoxRecord = Extract<EngineRecord, { t: 'x' | 'i' }>;
type Shading = EngineResult['shadings'][string];

/** pdfTeX's color stack after a push, a pop back to the color under it, or a set of the top; and the color then in force */
function colorStackAfter(stack: string[], r: ColorStackRecord): { stack: string[]; color: string | null } {
	if (r.cmd === 1) return { stack: [...stack, r.d], color: r.d };
	if (r.cmd === 2) {
		const rest = stack.slice(0, -1);
		return { stack: rest, color: rest.at(-1) ?? '0 g 0 G' };
	}
	if (r.cmd === 0) return { stack: [...stack.slice(0, Math.max(0, stack.length - 1)), r.d], color: r.d };
	return { stack, color: null };
}

function shadingGradient(id: string, shading: Shading, [x0, x1, y0, y1]: number[], ctm: Matrix): Gradient {
	const [xm, ym] = [(x0 + x1) / 2, (y0 + y1) / 2];
	return {
		id,
		kind: shading.kind === 'r' ? 'radial' : 'linear',
		from: shading.kind === 'h' ? [x0, ym] : shading.kind === 'v' ? [xm, y0] : [xm, ym],
		to: shading.kind === 'h' ? [x1, ym] : shading.kind === 'v' ? [xm, y1] : [xm, ym],
		radius: (x1 - x0) / 2,
		focus: shading.focus ? [xm + shading.focus[0] * BP_PER_PT, ym + shading.focus[1] * BP_PER_PT] : [xm, ym],
		transform: ctm.map(roundCoordinate),
		stops: shadingStops(shading.domain, shading.func).map((s) => ({ offset: roundCoordinate(s.offset), color: cssColor(rgbOf(s.color)) }))
	};
}

/** a box placed in the picture: one of pgf's shadings, an image, or a saved box the canvas cannot show */
function placeBox(g: PdfGraphics, r: BoxRecord, shadings: EngineResult['shadings']) {
	g.moveOrigin([0, 0]);
	const [x0, x1, y0, y1] = [r.x * BP_PER_PT, (r.x + r.w) * BP_PER_PT, -(r.y + r.d) * BP_PER_PT, -(r.y - r.h) * BP_PER_PT];
	const shading = r.t === 'x' ? shadings?.[r.n] : undefined;
	if (shading) {
		const gradient = shadingGradient(`shade${g.gradients.length + 1}`, shading, [x0, x1, y0, y1], g.state.ctm);
		g.gradients.push(gradient);
		g.fillRectangle(x0, y0, x1, y1, gradient.id);
	} else if (r.t === 'i' && r.p && RASTER.test(r.p)) {
		g.clearPath();
		g.parts.push({
			kind: 'image',
			stmt: g.statement,
			clip: g.state.clip,
			...(g.state.blend && { blend: g.state.blend }),
			path: r.p,
			matrix: compose(g.state.ctm, [x1 - x0, 0, 0, -(y1 - y0), x0, y1]).map(roundCoordinate) as Matrix,
			opacity: g.state.fillAlpha * g.groupAlpha
		});
	} else if (r.t === 'i') {
		g.fillPlaceholder(x0, y0, x1, y1);
		g.unsupported.add(r.p ? 'pdf image' : 'image');
	} else {
		g.clearPath();
		g.unsupported.add('saved box');
	}
}

/** the engine's records (pgf's pdf drawing ops, glyphs, rules, color stack, statement marks) as parts the canvas draws */
export function buildDrawing(result: EngineResult): Drawing {
	// pdf ops are in bp, TeX positions and box sizes in pt
	const firstLiteral = result.recs.find((r) => r.t === 'l');
	// the picture's ops sit at the first literal; everything is placed relative to it, so pgf's origin is 0,0
	const origin: [number, number] =
		firstLiteral && firstLiteral.t === 'l' ? [firstLiteral.x * BP_PER_PT, -firstLiteral.y * BP_PER_PT] : [0, 0];
	const g = new PdfGraphics(origin);
	let colorStack: string[] = [];
	for (const r of result.recs) {
		if (r.t === 'm') g.statement = r.i;
		else if (r.t === 'G' && r.on) g.beginGroup();
		else if (r.t === 'G') g.endGroup();
		else if (r.t === 'l') {
			g.moveOrigin([r.x * BP_PER_PT, -r.y * BP_PER_PT]);
			g.runOperators(r.d);
		} else if (r.t === 'c') {
			const after = colorStackAfter(colorStack, r);
			colorStack = after.stack;
			if (after.color !== null) g.runOperators(after.color);
		} else if (r.t === 'g') {
			g.moveOrigin([0, 0]);
			g.parts.push({
				kind: 'glyph',
				stmt: g.statement,
				clip: g.state.clip,
				...(g.state.blend && { blend: g.state.blend }),
				font: r.f,
				code: r.c,
				gi: r.gi,
				matrix: compose(g.state.ctm, [1, 0, 0, -1, r.x * BP_PER_PT, -r.y * BP_PER_PT]),
				fill: cssColor(g.state.fill),
				opacity: g.state.fillAlpha * g.groupAlpha
			});
		} else if (r.t === 'x' || r.t === 'i') placeBox(g, r, result.shadings);
		else if (r.t === 'r') {
			g.moveOrigin([0, 0]);
			const [x1, x2, top, bottom] = [r.x * BP_PER_PT, (r.x + r.w) * BP_PER_PT, -(r.y - r.h) * BP_PER_PT, -(r.y + r.d) * BP_PER_PT];
			g.fillRectangle(x1, bottom, x2, top);
		}
	}
	return {
		parts: g.parts,
		clips: g.clips,
		gradients: g.gradients,
		unsupported: [...g.unsupported],
		bbox: { x: -origin[0], y: -result.d * BP_PER_PT - origin[1], w: result.w * BP_PER_PT, h: (result.h + result.d) * BP_PER_PT }
	};
}
