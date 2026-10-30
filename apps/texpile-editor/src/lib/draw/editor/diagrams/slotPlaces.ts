import type { Point } from '../figure/geometry';
import type { DiagramGrid, DiagramSlot } from '../figure/figureLanguage';

/** a place on the grid a cell is or could go: one row and column past each edge counting */
export type GridPlace = { r: number; c: number; at: Point; cell: number | null };

// tikz-cd's own spacing, in bp, for a grid with one row or column to measure from
const STEP: Point = [45, 34];

/** each index's coordinate: measured where TeX put one, else filled in from its neighbors at their spacing */
function axisPlaces(known: Map<number, number>, last: number, fallback: number, sign: 1 | -1) {
	const ks = [...known.keys()].sort((a, b) => a - b);
	const step = ks.length > 1 ? (known.get(ks.at(-1)!)! - known.get(ks[0])!) / (ks.at(-1)! - ks[0]) : sign * fallback;
	const out = new Map<number, number>();
	if (!ks.length) return out;
	for (let k = 0; k <= last + 1; k++) {
		const below = ks.filter((x) => x <= k).at(-1);
		const above = ks.find((x) => x >= k);
		if (below !== undefined && above !== undefined && above !== below)
			out.set(k, known.get(below)! + ((known.get(above)! - known.get(below)!) * (k - below)) / (above - below));
		else {
			const from = below ?? above!;
			out.set(k, known.get(from)! + step * (k - from));
		}
	}
	return out;
}

function mean(xs: number[]) {
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function gridPlaces(grid: DiagramGrid, slots: DiagramSlot[]): GridPlace[] {
	function group(key: 'r' | 'c', k: 0 | 1) {
		const by = new Map<number, number[]>();
		for (const s of slots) by.set(s[key], [...(by.get(s[key]) ?? []), s.at[k]]);
		return new Map([...by].map(([i, xs]) => [i, mean(xs)]));
	}
	const xs = axisPlaces(group('c', 0), grid.cols, STEP[0], 1);
	// rows go down the page, y up
	const ys = axisPlaces(group('r', 1), grid.rows, STEP[1], -1);
	const out: GridPlace[] = [];
	for (const [r, y] of ys)
		for (const [c, x] of xs) out.push({ r, c, at: [x, y], cell: grid.cells.find((g) => g.r === r && g.c === c)?.cell ?? null });
	return out;
}

/** the free place nearest a point, within half a step of it */
export function freePlaceNear(places: GridPlace[], [x, y]: Point, reach: number) {
	let best: GridPlace | null = null;
	let bestDistance = reach;
	for (const p of places) {
		const d = Math.max(Math.abs(p.at[0] - x), Math.abs(p.at[1] - y));
		if (p.cell === null && d < bestDistance) [best, bestDistance] = [p, d];
	}
	return best;
}

/** how far apart neighboring places are, the smaller way */
export function placeStep(places: GridPlace[]) {
	const a = places.find((p) => p.r === 1 && p.c === 1);
	const b = places.find((p) => p.r === 2 && p.c === 2);
	return a && b ? Math.min(Math.abs(b.at[0] - a.at[0]), Math.abs(b.at[1] - a.at[1])) : Math.min(...STEP);
}
