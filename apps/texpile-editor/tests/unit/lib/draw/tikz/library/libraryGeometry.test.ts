// the drawn check needs lualatex, and is skipped without it: each library element edited as the editor edits
// it, then drawn by TeX, lands where the edit says on every point of every path
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../engines/lualatexEngine';
import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { canvasPoint, sourceDelta, sourcePoint, type Point, type SourceTransform } from '$lib/draw/editor/figure/geometry';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { LIBRARY_ELEMENTS } from '$lib/draw/tikz/library/libraryElements';
import { statementTransforms } from '$lib/draw/tikz/renderTikz';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture, type Statement } from '$lib/draw/tikz/source/picture';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';
import { elementPreamble } from './elementPreamble';

const TOLERANCE_BP = 0.6;

type Affine = (p: Point) => Point;

function documentWith(e: LibraryElement) {
	return `\\documentclass{article}\n\\begin{document}\n\\begin{tikzpicture}\n${e.text}\n\\end{tikzpicture}\n\\end{document}\n`;
}

function editEach(source: string, statements: Statement[], edit: (text: string, st: Statement) => string | null) {
	return [...statements].sort((a, b) => b.from - a.from).reduce((text, st) => edit(text, st) ?? text, source);
}

describe.skipIf(!hasLualatex)('library geometry', () => {
	useLualatex();

	async function drawn(e: LibraryElement, source: string) {
		const picture = readPicture(source)!;
		const result = await drawWithLualatex(elementPreamble(e), instrumentPicture(source, picture));
		expect(result.errors, `${e.id}\n${source}`).toEqual([]);
		const { own, outer } = statementTransforms(result.marks);
		const paths = buildDrawing(result).parts.flatMap((p) =>
			p.kind === 'path' && !p.gradient
				? [
						(p.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? [])
							.map(Number)
							.reduce<Point[]>((pts, n, k, all) => (k % 2 ? pts : [...pts, [n, all[k + 1]]]), [])
					]
				: []
		);
		const transform = (map: Map<number, SourceTransform>, i: number) => map.get(i) ?? map.get(0)!;
		return { picture, paths, own: (i: number) => transform(own, i), outer: (i: number) => transform(outer, i) };
	}

	const misses: string[] = [];
	/** every point of each path of `before`, put through `map`, on its path in `after`, and back: a flip draws a closed
	 *  curve from another of its points, so the points are matched as a set; the first miss of each is kept */
	function expectMapped(e: LibraryElement, what: string, before: Point[][], after: Point[][], map: Affine) {
		if (after.length !== before.length) return void misses.push(`${e.id} ${what}: ${after.length} paths for ${before.length}`);
		for (const [k, path] of before.entries()) {
			// a dot written in pt keeps its size: only where it is counts
			const xs = path.map((p) => p[0]);
			const ys = path.map((p) => p[1]);
			if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 6) {
				const mid = (pts: Point[]): Point => [
					pts.reduce((t, p) => t + p[0], 0) / pts.length,
					pts.reduce((t, p) => t + p[1], 0) / pts.length
				];
				const [want, got] = [map(mid(path)), mid(after[k])];
				if (!(Math.hypot(want[0] - got[0], want[1] - got[1]) < TOLERANCE_BP))
					return void misses.push(`${e.id} ${what}: dot ${k} moved wrong`);
				continue;
			}
			const want = path.map(map);
			const near = (p: Point, among: Point[]) => Math.min(...among.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
			const off = Math.max(...want.map((p) => near(p, after[k])), ...after[k].map((p) => near(p, want)));
			if (!(off < TOLERANCE_BP)) return void misses.push(`${e.id} ${what}: path ${k} off by ${off.toFixed(2)}bp`);
		}
	}
	function expectNoMisses() {
		const found = misses.splice(0);
		expect(found).toEqual([]);
	}

	const tops = (picture: ReturnType<typeof readPicture>) => picture!.statements.filter((s) => !s.inScope);
	const leaves = (picture: ReturnType<typeof readPicture>) => picture!.statements.filter((s) => s.kind !== 'scope');

	it('moves every element by its leaves, as a drag does', async () => {
		for (const e of LIBRARY_ELEMENTS.filter((e) => !e.usepackage)) {
			const source = documentWith(e);
			const at = await drawn(e, source);
			// whole steps of a grid's, which TikZ draws at multiples of its step
			const by: Point = [72 / 2.54, -36 / 2.54];
			const moved = editEach(source, leaves(at.picture), (text, st) => {
				return lang.shiftStatement(text, st, ...sourceDelta(...by, at.outer(st.i)));
			});
			expectMapped(e, 'move', at.paths, (await drawn(e, moved)).paths, ([x, y]) => [x + by[0], y + by[1]]);
		}
		expectNoMisses();
	}, 120_000);

	it('puts every element where it is dropped, as the library does', async () => {
		for (const e of LIBRARY_ELEMENTS.filter((e) => !e.usepackage)) {
			const source = documentWith(e);
			const at = await drawn(e, source);
			const placed = editEach(source, tops(at.picture), (text, st) => lang.shiftStatement(text, st, 2, -1));
			const cm = 72 / 2.54;
			expectMapped(e, 'drop', at.paths, (await drawn(e, placed)).paths, ([x, y]) => [x + 2 * cm, y - cm]);
		}
		expectNoMisses();
	}, 120_000);

	it('stretches every element of paths alone from a corner, evenly, unevenly and flipped', async () => {
		// a grid's step and a decoration's segments keep their size, and an outlined node is sized, not stretched;
		// arrow tips keep theirs too, so each element is compared without them
		const pathsOnly = LIBRARY_ELEMENTS.filter(
			(e) => !e.usepackage && !/node\[[^\]]*\bdraw\b|\\node\[[^\]]*\bdraw\b|grid|decorate/.test(e.text)
		).map((e) => ({ ...e, text: e.text.replace(/<->|->|<-|-Stealth|-Latex/g, '-') }));
		for (const [sx, sy] of [
			[1.5, 1.5],
			[1.5, 0.6],
			[-1, 1]
		]) {
			for (const e of pathsOnly) {
				const source = documentWith(e);
				const at = await drawn(e, source);
				const anchor: Point = [0, 0];
				// a circle stays round, and a turned part has no axes of the sheet's to stretch along
				if (sx !== Math.abs(sy) && /circle|rotate/.test(e.text)) continue;
				// a bend is an angle off its chord, which flips but does not stretch unevenly
				if (Math.abs(sx) !== Math.abs(sy) && /bend/.test(e.text)) continue;
				const stretched = editEach(source, leaves(at.picture), (text, st) =>
					lang.stretchStatement(text, st, sourcePoint(...anchor, at.own(st.i)), sx, sy)
				);
				expectMapped(e, `stretch ${sx},${sy}`, at.paths, (await drawn(e, stretched)).paths, ([x, y]) => [x * sx, y * sy]);
			}
		}
		expectNoMisses();
	}, 240_000);

	it('turns every element about a point, as the handle does', async () => {
		// a decoration's segments are laid along the path as TeX finds it, a little differently once turned
		for (const e of LIBRARY_ELEMENTS.filter((e) => !e.usepackage && !/\\node|node\[|decorate/.test(e.text))) {
			const source = documentWith(e);
			const at = await drawn(e, source);
			const center: Point = [10, 5];
			const degrees = 30;
			const turned = editEach(source, tops(at.picture), (text, st) =>
				lang.rotateStatement(text, st, sourcePoint(...center, at.outer(st.i)), degrees)
			);
			const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
			expectMapped(e, 'turn', at.paths, (await drawn(e, turned)).paths, ([x, y]) => [
				center[0] + c * (x - center[0]) - s * (y - center[1]),
				center[1] + s * (x - center[0]) + c * (y - center[1])
			]);
		}
		expectNoMisses();
	}, 120_000);

	it('moves a turned element, as a drag after a turn does', async () => {
		for (const e of LIBRARY_ELEMENTS.filter((e) => !e.usepackage && !/\\node|node\[/.test(e.text))) {
			const first = documentWith(e);
			const before = await drawn(e, first);
			const turned = editEach(first, tops(before.picture), (text, st) =>
				lang.rotateStatement(text, st, sourcePoint(0, 0, before.outer(st.i)), 90)
			);
			const at = await drawn(e, turned);
			const by: Point = [72 / 2.54, 36 / 2.54];
			const moved = editEach(turned, leaves(at.picture), (text, st) => {
				return lang.shiftStatement(text, st, ...sourceDelta(...by, at.outer(st.i)));
			});
			expectMapped(e, 'turn then move', at.paths, (await drawn(e, moved)).paths, ([x, y]) => [x + by[0], y + by[1]]);
		}
		expectNoMisses();
	}, 120_000);

	it('checks the canvas points the way the editor does', () => {
		// a sanity check of the transforms the moves are measured in
		expect(canvasPoint(1, 0, [2, 0, 0, 2, 5, 5])).toEqual([7, 5]);
	});
});
