import { it, expect } from 'vitest';
import { PointIndex, type IndexEntry, type Point } from '../../../../../../../electron/src/draft/teleport/pointIndex';

function point(rec: string, stack: [string, number][], open = false): IndexEntry {
	return { point: { rec, stack, shipped: 0, open } };
}
function index(entries: IndexEntry[]): PointIndex {
	return new PointIndex(entries, 'main.tex', 3, [], '', '/seeds');
}
const recs = (ps: Point[]) => ps.map((p) => p.rec);

// a point inside intro.tex that cannot be entered (no point on the line that opened it) made the start fall back to
// main.tex:9, and the points between there and the edit, still before it, matched as stops
it('lists as stops only the points past the edit', () => {
	const ix = index([
		point('a', [['main.tex', 9]]),
		{ enter: 'sections/intro.tex' },
		point('b', [
			['main.tex', 18],
			['sections/intro.tex', 5]
		]),
		point('c', [
			['main.tex', 18],
			['sections/intro.tex', 30]
		]),
		point('d', [['main.tex', 20]])
	]);
	const plan = ix.planFor('sections/intro.tex', { from: 12, oldTo: 12, newTo: 12 })!;
	expect(recs(plan.chain)).toEqual(['a']);
	expect(recs(plan.stops)).toEqual(['c', 'd']);
});

// a run recorded its entry line again, placed after the points inside the file it opened; the next edit in that
// file stopped there, before reading the edit
it('never lists a point at the start as a stop', () => {
	const ix = index([
		point('a', [['main.tex', 16]], true),
		{ enter: 'sections/intro.tex' },
		point('b', [
			['main.tex', 16],
			['sections/intro.tex', 9]
		]),
		point('again', [['main.tex', 16]], true),
		point('c', [['main.tex', 30]])
	]);
	const plan = ix.planFor('sections/intro.tex', { from: 3, oldTo: 3, newTo: 3 })!;
	expect(recs(plan.chain)).toEqual(['a']);
	expect(recs(plan.stops)).toEqual(['b', 'c']);
});

it('moves the points past the stop by the lines the edit added', () => {
	const ix = index([point('a', [['main.tex', 5]]), point('b', [['main.tex', 12]]), point('c', [['main.tex', 40]])]);
	const plan = ix.planFor('main.tex', { from: 8, oldTo: 8, newTo: 10 })!;
	ix.merge(plan, 'main.tex', { from: 8, oldTo: 8, newTo: 10 }, [point('n', [['main.tex', 11]])], 'c');
	expect(ix.entries.map((e) => ('point' in e ? `${e.point.rec}@${e.point.stack[0][1]}` : 'enter'))).toEqual(['a@5', 'n@11', 'c@42']);
});

// the sweep removed the compile's folder once no point lived there, and with its image list gone no engine parked
it('keeps the folder that holds the image list', () => {
	const ix = index([point('_draft/pserved/tele/r-00001.lua', [['main.tex', 9]])]);
	ix.imageList = '_draft/pcompile/tele/images.lua';
	expect(ix.folders().has('pcompile')).toBe(true);
});
