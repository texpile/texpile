import { m } from '$lib/paraglide/messages';
import type { RenderedFigure } from '$lib/draw/editor/figure/figureLanguage';
import type { SourceTransform } from '$lib/draw/editor/figure/geometry';
import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import type { TypstResult } from './typstResult';
import { svgToDrawing } from './drawing/svgToDrawing';
import { instrumentPicture } from './source/instrument';
import { angleOf } from './source/moves/rotation';
import type { CetzPicture, CetzStatement } from './source/picture';
import { readPair } from './source/syntax';

// past this many, the picture is more broken than one statement
const MOST_LEFT_OUT = 3;

/** text turned by its `angle` turns about where it is placed, as a TikZ node by its `rotate` */
function turnedText(source: string, st: CetzStatement, [a, b, c, d, e, f]: SourceTransform = [1, 0, 0, 1, 0, 0]): SourceTransform | null {
	const degrees = angleOf(source, st);
	const at = st.args.find((x) => !x.name);
	const p = degrees && at ? readPair(source.slice(at.value.from, at.value.to)) : null;
	if (!p) return null;
	const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
	const [ex, ey] = [p[0] - cos * p[0] + sin * p[1], p[1] - sin * p[0] - cos * p[1]];
	return [a * cos + c * sin, b * cos + d * sin, -a * sin + c * cos, -b * sin + d * cos, a * ex + c * ey + e, b * ex + d * ey + f];
}

/**
 * The statements that lose the whole picture, found by drawing it with only the first k kept: the shortest such run
 * ends with one. Each is left out in turn until the rest draws, as TikZ's are
 */
async function leaveOutBroken(draw: (leaveOut: number[]) => Promise<TypstResult>, picture: CetzPicture) {
	const leaves = picture.statements.filter((s) => s.kind !== 'scope').map((s) => s.i);
	const out: number[] = [];
	if (!(await draw(leaves)).svg) return null;
	while (out.length < MOST_LEFT_OUT) {
		const left = leaves.filter((i) => !out.includes(i));
		let [drawn, broken] = [0, left.length];
		while (broken - drawn > 1) {
			const k = (drawn + broken) >> 1;
			if (!(await draw([...out, ...left.slice(k)])).svg) broken = k;
			else drawn = k;
		}
		out.push(left[broken - 1]);
		const result = await draw(out);
		if (result.svg) return { result, out };
	}
	return null;
}

export async function renderCetz(engine: FigureEngine, source: string, picture: CetzPicture): Promise<RenderedFigure> {
	let lines = { headLines: 0, firstLine: 0 };
	async function draw(leaveOut: number[]) {
		const { job, headLines, firstLine } = instrumentPicture(source, picture, leaveOut);
		lines = { headLines, firstLine };
		return (await engine.render(job)) as TypstResult;
	}
	let result = await draw([]);
	let failed: number[] = [];
	if (!result.svg) {
		const kept = await leaveOutBroken(draw, picture);
		// Typst draws nothing when a picture has an error; the canvas keeps what it last drew and says why
		if (!kept) throw new Error(result.errors[0] ?? m.figure_render_typst_failed());
		failed = kept.out;
		// the first error is the one the left-out statements made
		result = {
			...kept.result,
			errors: [...result.errors.slice(0, 1), ...kept.result.errors],
			errorLines: [...result.errorLines.slice(0, 1), ...kept.result.errorLines]
		};
	}
	const { drawing, transforms, outer } = svgToDrawing(result.svg!);
	for (const st of picture.statements) {
		const turned = st.kind === 'node' && !st.text ? turnedText(source, st, outer.get(st.i)) : null;
		if (turned) transforms.set(st.i, turned);
	}
	const { headLines, firstLine } = lines;
	return {
		drawing,
		fonts: new Map(),
		outline: () => null,
		transforms,
		outerTransforms: outer,
		errors: result.errors,
		errorLines: result.errorLines.map((l) => (l !== null && l > headLines ? firstLine + l - headLines - 1 : null)),
		failed,
		slots: [],
		pins: [],
		ms: result.ms
	};
}
