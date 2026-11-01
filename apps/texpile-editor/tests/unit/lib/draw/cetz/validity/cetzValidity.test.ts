// every edit the editor makes, on each kind of picture it reads, still compiles; Typst is fast enough to run it always
import { describe, expect, it } from 'vitest';
import { drawWithTinymist, hasTinymist, useTinymist } from '../../engines/tinymistEngine';
import type { FigureStatement, TrimmedShape } from '$lib/draw/editor/figure/figureLanguage';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';
import { instrumentPicture } from '$lib/draw/cetz/source/instrument';
import { FIXTURES, SHAPES, TYPED } from './validityFixtures';

function statementEdits(source: string, st: FigureStatement) {
	const edits: [string, string | null][] = [
		['move', lang.shiftStatement(source, st, 0.5, 0.25)],
		['stretch', lang.stretchStatement(source, st, [0, 0], 1.5, 0.75)],
		['duplicate', lang.duplicateStatement(source, st, 0.5, 0.5)],
		[
			'delete',
			lang.removeStatement(
				lang.letGoOf(
					source,
					0,
					[st.i],
					() => [1, 1],
					() => [1, 1]
				),
				st
			)
		],
		['label', lang.writeLabel(source, st, 'Part')],
		['group', lang.groupStatements(source, lang.readPicture(source, 0)!, [st.i])?.source ?? null],
		['ungroup', lang.ungroupStatement(source, lang.readPicture(source, 0)!, st.i)?.source ?? null],
		['earlier', lang.moveStatements(source, lang.readPicture(source, 0)!, [st.i], { before: st.i - 1 })?.source ?? null],
		['later', lang.moveStatements(source, lang.readPicture(source, 0)!, [st.i], { after: st.i + 1 })?.source ?? null],
		['rotate', lang.rotateStatement(source, st, [1, 1], 30)],
		['unrotate', lang.rotateStatement(source, st, [5, 5], -(lang.readRotation(source, st) ?? 0))]
	];
	for (const [k, p] of lang.pathPoints(source, st).entries())
		edits.push([`point ${k}`, lang.movePoint(source, lang.pathPoints(source, st), k, [p.x + 1, p.y])]);
	if (lang.readStyle(source, st))
		for (const change of [
			{ stroke: 'red' },
			{ stroke: null },
			{ fill: 'green' },
			{ width: '2pt' },
			{ dash: 'dashed' },
			{ arrows: '<->' },
			{ corners: 'rounded' as const },
			{ textColor: 'blue' },
			{ textSize: 'Large' },
			{ fill: null, stroke: null },
			{ opacity: '50' }
		])
			edits.push([`style ${JSON.stringify(change)}`, lang.writeStyle(source, st, change)]);
	if (lang.readNodeLines(source, st))
		for (const t of TYPED.filter((t) => !lang.textProblem(t))) edits.push([`text ${t}`, lang.writeNodeLines(source, st, [t, 'more'])]);
	for (const k of [0, 1] as const) edits.push([`end ${k}`, lang.attachEnd(source, 0, st.i, k, [3, 3])]);
	if (lang.readConnector(source, st)) {
		const routes = ['straight', 'hv', 'vh', 'bend left', 'bend right', 'curve', 'loop above'] as const;
		for (const route of routes) edits.push([`route ${route}`, lang.writeConnector(source, st, { route })]);
		edits.push(['label', lang.writeConnector(source, st, { label: { text: 'yes $x$', pos: 'near end', side: 'above' } })]);
		edits.push(['no label', lang.writeConnector(source, st, { label: null })]);
		const box = lang.readPicture(source, 0)!.statements.find((s) => lang.nameOf(source, s) === 'b1');
		// a name is known after it is given, in Typst as in TeX
		for (const anchor of box && box.i < st.i ? [null, 'north east', 'west'] : [])
			edits.push([`onto b1 ${anchor}`, lang.attachEnd(source, 0, st.i, 1, { ref: box!.i, at: [1, 7.5], anchor })]);
	}
	if (st.kind === 'node') {
		for (const side of ['north', 'south', 'east', 'west'] as const)
			edits.push([`step ${side}`, lang.addStep(source, 0, st.i, side, 'Next')?.source ?? null]);
		edits.push(['free', lang.writePlacement(source, st, { at: [2, 2] })]);
		const box = lang.readPicture(source, 0)!.statements.find((s) => lang.nameOf(source, s) === 'b1');
		const directions = ['above', 'below left', 'right'] as const;
		for (const direction of box && box.i < st.i ? directions : [])
			edits.push([`place ${direction}`, lang.writePlacement(source, st, { direction, distance: '2cm', of: 'b1' })]);
	}
	const cut = lang.trimmable(source, st);
	if (cut) {
		const left: TrimmedShape =
			cut.kind === 'polyline'
				? {
						kind: 'polyline',
						runs: [
							{ points: cut.runs[0].points.slice(0, 2), closed: false },
							{ points: cut.runs[0].points.slice(-2), closed: false }
						]
					}
				: cut.kind === 'ellipse'
					? {
							kind: 'arcs',
							center: cut.center,
							rx: cut.rx,
							ry: cut.ry,
							spans: [
								[0, 60],
								[90, 150]
							]
						}
					: {
							kind: 'polyline',
							runs: [
								{
									points: [
										[0, 0],
										[1, 0],
										[1, 1]
									],
									closed: false
								}
							]
						};
		edits.push(['trim', lang.writeTrimmed(source, st, left)]);
	}
	if (lang.readNodeBox(source, st)?.state)
		for (const change of [{ initial: true }, { initial: false }, { accepting: true }, { accepting: false }])
			edits.push([`state ${JSON.stringify(change)}`, lang.writeNodeBox(source, st, change)]);
	if (lang.readNodeBox(source, st))
		for (const change of [...lang.nodeShapes.map((shape) => ({ shape })), { w: 3 }, { h: 2 }, { w: null }])
			edits.push([`box ${JSON.stringify(change)}`, lang.writeNodeBox(source, st, change)]);
	return edits;
}

describe.skipIf(!hasTinymist)('every CeTZ edit compiles', () => {
	useTinymist();

	async function compile(source: string) {
		const picture = lang.readPicture(source, 0);
		if (!picture) return ['no picture'];
		return (await drawWithTinymist(instrumentPicture(source, picture as never).job)).errors;
	}

	it.each(Object.entries(FIXTURES))(
		'%s',
		async (_, source) => {
			expect(await compile(source)).toEqual([]);
			const picture = lang.readPicture(source, 0)!;
			const at = (i: number, k: number) => ({ stmt: i, k });
			const named = picture.statements.filter((s) => lang.pathPoints(source, s).length);
			const dimensions = named.flatMap((st): [string, string | null][] => {
				const points = lang.pathPoints(source, st);
				const last = points.length - 1;
				const apart = last > 0 && (points[0].x !== points[last].x || points[0].y !== points[last].y);
				return [
					...(apart
						? ([
								[
									`${st.i} dimension aligned`,
									lang.addDimension(source, 0, { kind: 'aligned', from: at(st.i, 0), to: at(st.i, last), offset: 0.5 })
								],
								[
									`${st.i} dimension x`,
									lang.addDimension(source, 0, { kind: 'x', from: at(st.i, 0), to: at(st.i, last), offset: 0.5, label: 'a' })
								]
							] as [string, string | null][])
						: []),
					...(st.kind === 'node'
						? ([
								[`${st.i} dimension node`, lang.addDimension(source, 0, { kind: 'node', stmt: st.i, axis: 'y', side: -1, offset: 0.5 })]
							] as [string, string | null][])
						: []),
					[
						`${st.i} dimension radius`,
						lang.addDimension(source, 0, { kind: 'radius', center: at(st.i, 0), length: 1, value: 1, angle: 30 })
					]
				];
			});
			const tried: [string, string | null][] = [
				...dimensions,
				...SHAPES.map((s): [string, string | null] => [`add ${s.tool}`, lang.addShape(source, 0, s)]),
				// what a tool writes is arranged as anything written by hand is
				...SHAPES.flatMap((s): [string, string | null][] => {
					const added = lang.addShape(source, 0, s);
					const now = added && lang.readPicture(added, 0);
					if (!now) return [];
					return now.statements
						.filter((st) => st.i > picture.statements.length)
						.map((st) => [`add ${s.tool}, ${st.i} earlier`, lang.moveStatements(added, now, [st.i], { before: st.i - 1 })?.source ?? null]);
				}),
				['frame', lang.writeFrame(source, picture, { x1: -1, y1: -1, x2: 9, y2: 7 })],
				...picture.statements.flatMap((st) =>
					statementEdits(source, st).map(([what, next]): [string, string | null] => [`${st.i} ${what}`, next])
				)
			];
			const broken: string[] = [];
			for (const [what, next] of tried.filter(([, next]) => next && next !== source && !lang.brokenNeed(source, next, 0))) {
				const errors = await compile(next!);
				if (errors.length) broken.push(`${what}: ${errors[0]}`);
			}
			expect(broken).toEqual([]);
			// every tool the editor offers writes something
			expect(SHAPES.filter((s) => !lang.addShape(source, 0, s)).map((s) => s.tool)).toEqual([]);
		},
		300_000
	);
});
