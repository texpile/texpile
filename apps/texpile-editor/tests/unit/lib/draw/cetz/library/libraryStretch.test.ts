// each element stretched as the editor stretches a selection, about a corner, lands where the stretch says
import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../engines/tinymistEngine';
import type { DrawnPart } from '$lib/draw/editor/drawing/drawing.types';
import { canvasPoint, sourcePoint, type Point } from '$lib/draw/editor/figure/geometry';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';
import { LIBRARY_ELEMENTS } from '$lib/draw/cetz/library/libraryElements';
import { NEW_PICTURE } from '$lib/draw/cetz/source/pictures';

const TOLERANCE_BP = 0.6;

/** the stroked lines drawn, each as its points: text and filled dots keep their size, so they are left out */
function lines(parts: DrawnPart[]) {
	return parts.flatMap((p) =>
		p.kind === 'path' && p.stroke !== null
			? [
					// a move straight followed by another draws nothing: Typst starts each path at its box's corner
					(p.d.replace(/M[^A-Za-z]*(?=M)/g, '').match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? [])
						.map(Number)
						.reduce<Point[]>((pts, n, k, all) => (k % 2 ? pts : [...pts, [n, all[k + 1]]]), [])
				]
			: []
	);
}

describe.skipIf(!hasTinymist)('library stretches', () => {
	useTinymist();
	const engine = tinymistEngine;

	it('stretches every element evenly, unevenly and flipped', async () => {
		const misses: string[] = [];
		const before = lang.readPicture(NEW_PICTURE, 0)!.statements.length;
		// arrowheads keep their size, as a grid keeps its step, and a turn or a decoration has no axes to stretch along
		const elements = LIBRARY_ELEMENTS.filter((e) => !e.usepackage && !/decorations|plot|chart|angle\.|rotate|brace|grid\(/.test(e.text));
		for (const e of elements) {
			const added = lang.addElement(NEW_PICTURE, 0, { ...e, text: e.text.replace(/,\s*mark:\s*\((?:[^()]|\([^()]*\))*\)/g, '') })!;
			const picture = lang.readPicture(added, 0)!;
			const leaves = picture.statements.filter((s) => s.i > before && s.kind !== 'scope');
			const was = await lang.render(engine, added, picture);
			for (const [sx, sy] of [
				[1.5, 1.5],
				[1.5, 0.6],
				[-1, 1]
			] as const) {
				if (Math.abs(sx) !== Math.abs(sy) && /circle|arc\(/.test(e.text)) continue;
				const anchor: Point = [7, 5];
				const stretched = [...leaves]
					.sort((a, b) => b.from - a.from)
					.reduce((text, st) => lang.stretchStatement(text, st, anchor, sx, sy) ?? text, added);
				const now = await lang.render(engine, stretched, lang.readPicture(stretched, 0)!);
				// each drawing is placed by its own bounds, which a stretch past the sheet changes
				const [t0, t1] = [was.transforms.get(leaves[0].i)!, now.transforms.get(leaves[0].i)!];
				const map = ([x, y]: Point): Point => {
					const [u, v] = sourcePoint(x, y, t0);
					return canvasPoint(anchor[0] + sx * (u - anchor[0]), anchor[1] + sy * (v - anchor[1]), t1);
				};
				const [l0, l1] = [lines(was.drawing.parts), lines(now.drawing.parts)];
				if (l0.length !== l1.length) {
					misses.push(`${e.id} ${sx},${sy}: ${l1.length} lines for ${l0.length}`);
					continue;
				}
				for (const [k, path] of l0.entries()) {
					const near = (p: Point, among: Point[]) => Math.min(...among.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
					const want = path.map(map);
					const off = Math.max(...want.map((p) => near(p, l1[k])), ...l1[k].map((p) => near(p, want)));
					if (!(off < TOLERANCE_BP)) {
						misses.push(`${e.id} ${sx},${sy}: line ${k} off by ${off.toFixed(1)}bp`);
						break;
					}
				}
			}
		}
		expect(misses).toEqual([]);
	}, 300_000);
});
