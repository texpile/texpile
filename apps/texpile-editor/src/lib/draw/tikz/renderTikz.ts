import { m } from '$lib/paraglide/messages';
import type { EngineResult } from '$lib/draw/tikz/tikzResult';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import type { RenderedFigure } from '$lib/draw/editor/figure/figureLanguage';
import type { SourceTransform } from '$lib/draw/editor/figure/geometry';
import { BP_PER_PT } from '$lib/draw/editor/figure/lengthUnits';
import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { buildDrawing } from './drawing/buildDrawing';
import { instrumentPicture } from './source/instrument';
import type { Picture } from './source/picture';
import { slotOf } from './source/cd/cdPicture';
import { readPins } from './source/circuits/circuitPins';
import { EDGE_MARK, withEdgesOwned } from './source/forest/forestPicture';

// how the engine notes a package it does not have, which it leaves out (webTexEngine.ts)
const LEFT_OUT = ', so the figure is drawn without it';
// past this many, the picture is more broken than one statement
const MOST_LEFT_OUT = 3;

/** pgf's transform at a mark, as one from the statement's coordinates to the canvas: a coordinate is a sum of the
 *  unit vectors (`x=`, `y=`), put through the transform */
export function pgfTransform([a, b, c, d, e, f, xx, xy, yx, yy]: readonly number[]): SourceTransform {
	// pgf's marks are in TeX pt; the canvas is bp
	const k = BP_PER_PT;
	return [(a * xx + c * xy) * k, (b * xx + d * xy) * k, (a * yx + c * yy) * k, (b * yx + d * yy) * k, e * k, f * k];
}

/** each statement's transform, by statement number: `outer` where it starts, and `own` once its own options apply
 *  (scale, rotate), which its points are written in. The first mark of a statement is where it starts: pgfplots marks
 *  its axis again after each plot, with its own units set */
export function statementTransforms(marks: EngineResult['marks']) {
	const kept = marks.filter((m) => m.i >= 0 && m.i < EDGE_MARK);
	const outer = new Map([...kept].reverse().flatMap((m) => (m.own ? [] : [[m.i, pgfTransform(m.m)] as const])));
	const own = new Map([...outer, ...kept.flatMap((m) => (m.own ? [[m.i, pgfTransform(m.m)] as const] : []))]);
	return { outer, own };
}

// one font cache per engine, shared by the editor and every figure in the document
const outlinesByEngine = new WeakMap<FigureEngine, ReturnType<typeof createFontOutlines>>();

// TeX never reached the end of the picture: an unclosed $ or \( takes the whole of it
function lost(r: EngineResult) {
	return !r.marks.some((m) => m.i === 0);
}

/**
 * The statements that lose the whole picture, found by drawing it with only the first k kept: the shortest such run
 * ends with one. Each is left out in turn until the rest draws
 */
async function leaveOutBroken(draw: (leaveOut: number[]) => Promise<EngineResult>, picture: Picture) {
	const leaves = picture.statements.filter((s) => s.kind !== 'scope').map((s) => s.i);
	const out: number[] = [];
	if (lost(await draw(leaves))) return null;
	while (out.length < MOST_LEFT_OUT) {
		const left = leaves.filter((i) => !out.includes(i));
		let [drawn, broken] = [0, left.length];
		while (broken - drawn > 1) {
			const k = (drawn + broken) >> 1;
			if (lost(await draw([...out, ...left.slice(k)]))) broken = k;
			else drawn = k;
		}
		out.push(left[broken - 1]);
		const result = await draw(out);
		if (!lost(result)) return { result, out };
	}
	return null;
}

/** each error's line in the source, from the line of the job TeX was reading: the job ends with the picture, line for
 *  line as it is written */
export function errorSourceLines(source: string, picture: Picture, job: string, result: EngineResult) {
	const pictureLines = source.slice(picture.from, picture.to).split('\n').length;
	const first = job.split('\n').length - pictureLines + 1;
	const at = source.slice(0, picture.from).split('\n').length;
	return result.errors.map((_, k) => {
		const line = result.errorLines?.[k];
		return line && line >= first ? at + line - first : null;
	});
}

/** what TeX said when it could not draw the picture at all, a package it does not have named as the likely cause */
function cannotDraw(errors: string[]) {
	const missing = errors.filter((e) => e.endsWith(LEFT_OUT));
	const said = errors.find((e) => !e.endsWith(LEFT_OUT))?.replace(/^!\s*/, '') ?? m.figure_render_stopped_early();
	const why = missing.map((e) => ` ${m.figure_render_missing_package({ name: e.slice(0, -LEFT_OUT.length) })}`).join('');
	return m.figure_render_cannot_draw({ said, why });
}

export async function renderTikz(engine: FigureEngine, source: string, picture: Picture): Promise<RenderedFigure> {
	let outlines = outlinesByEngine.get(engine);
	if (!outlines) {
		const read = engine.readFont;
		if (!read) throw new Error(m.figure_render_no_fonts());
		outlinesByEngine.set(engine, (outlines = createFontOutlines(read)));
	}
	async function draw(leaveOut: number[]) {
		const job = instrumentPicture(source, picture, leaveOut);
		const drawn = (await engine.render(job)) as EngineResult;
		return { ...drawn, errorLines: errorSourceLines(source, picture, job, drawn) };
	}
	let result = await draw([]);
	let failed: number[] = [];
	if (lost(result)) {
		const kept = await leaveOutBroken(draw, picture);
		if (!kept) throw new Error(cannotDraw(result.errors));
		failed = kept.out;
		// the first error is the one the left-out statements made
		result = {
			...kept.result,
			errors: [...result.errors.slice(0, 1), ...kept.result.errors],
			errorLines: [...(result.errorLines ?? []).slice(0, 1), ...(kept.result.errorLines ?? [])]
		};
	}
	const drawing = buildDrawing(result);
	const { outer, own } = statementTransforms(result.marks);
	// marks below zero are a diagram's slots or a circuit's pins
	const apart = result.marks.filter((m) => m.i < 0).map((m) => ({ i: m.i, at: pgfTransform(m.m).slice(4, 6) as [number, number] }));
	return {
		drawing: picture.layout === 'tree' ? { ...drawing, parts: withEdgesOwned(drawing.parts) } : drawing,
		fonts: await outlines.loadFonts(result.fonts),
		outline: outlines.outline,
		transforms: own,
		outerTransforms: outer,
		slots: picture.layout === 'grid' ? apart.map((m) => ({ ...slotOf(m.i), at: m.at })) : [],
		pins: picture.circuit ? readPins(source, picture, apart) : [],
		errors: result.errors,
		errorLines: result.errorLines ?? result.errors.map(() => null),
		failed,
		ms: result.ms
	};
}
