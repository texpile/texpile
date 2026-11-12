import { it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
	ix.merge(plan, 'main.tex', { from: 8, oldTo: 8, newTo: 10 }, [{ after: 8, by: 2 }], [point('n', [['main.tex', 11]])], 'c');
	expect(ix.entries.map((e) => ('point' in e ? `${e.point.rec}@${e.point.stack[0][1]}` : 'enter'))).toEqual(['a@5', 'n@11', 'c@42']);
});

// the sweep removed the compile's folder once no point lived there, and with its image list gone no engine parked
it('keeps the folder that holds the image list', () => {
	const ix = index([point('_draft/pserved/tele/r-00001.lua', [['main.tex', 9]])]);
	ix.imageList = '_draft/pcompile/tele/images.lua';
	expect(ix.folders().has('pcompile')).toBe(true);
});

// an agent took back the first hunk of a write: the cut run had shipped its page, and the next run started below it
it('starts before and stops past the pages a cut run left', () => {
	const at = (rec: string, line: number, shipped: number): IndexEntry => ({
		point: { rec, stack: [['main.tex', line]], shipped, open: false }
	});
	const ix = index([at('p1', 5, 0), at('p2', 10, 1), at('p3', 20, 2), at('p4', 30, 3)]);
	const plan = ix.planFor('main.tex', { from: 15, oldTo: 15, newTo: 15 }, { from: 1, to: 4 })!;
	expect(recs(plan.chain)).toEqual(['p1']);
	expect(recs(plan.stops)).toEqual(['p4']);
});

// a cut run's points went in ahead of the old entry into the file they sit in, and an edit above them found the file
// never entered: 'outside', and the preview kept the old page
it('keeps the file a cut run entered readable', () => {
	const intro = (rec: string, line: number) =>
		point(rec, [
			['main.tex', 5],
			['intro.tex', line]
		]);
	const ix = index([point('m3', [['main.tex', 3]]), point('m5', [['main.tex', 5]], true), { enter: 'intro.tex' }, intro('i30', 30)]);
	const edit = { from: 20, oldTo: 20, newTo: 20 };
	ix.keepBefore(ix.planFor('intro.tex', edit)!, 'intro.tex', edit, [{ enter: 'intro.tex' }, intro('i18', 18), intro('i25', 25)]);
	const above = ix.planFor('intro.tex', { from: 4, oldTo: 4, newTo: 4 });
	expect(above && recs(above.stops)).toEqual(['i18', 'i30']);
});

// a compile that read older text than the live preview shows stands on the same ground, and only the text differs:
// that is what lets the preview keep its index and engines when such a compile lands
it('tells the same ground from the same text', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'point-index-'));
	function reading(text: string): PointIndex {
		const ix = index([]);
		const file = path.join(dir, `${text.length}.tex`);
		fs.writeFileSync(file, text);
		ix.basis.set('main.tex', file);
		return ix;
	}
	const live = reading('one\ntwo more\n');
	expect(live.sameGround(reading('one\ntwo\n'), dir)).toBe(true);
	expect(live.standsOn(reading('one\ntwo\n'), dir)).toBe(false);
	expect(live.standsOn(reading('one\ntwo more\n'), dir)).toBe(true);
	expect(live.sameGround(new PointIndex([], 'main.tex', 4, [], '', '/seeds'), dir)).toBe(false);
	fs.rmSync(dir, { recursive: true, force: true });
});

// figures that move to other pages get other object numbers in the next compile. A compile behind the typing is
// dropped on the same ground, and that renumbering alone must leave it the same ground
it('takes the same images at other object numbers for the same ground only when asked', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'point-index-'));
	function withImages(name: string, list: string): PointIndex {
		const ix = index([]);
		fs.writeFileSync(path.join(dir, name), list);
		ix.imageList = name;
		return ix;
	}
	const live = withImages('a.lua', 'return {{file="p.pdf",h="4pt",hash="",n=172,path="./p.pdf",w="6pt",},}\n');
	const moved = withImages('b.lua', 'return {{file="p.pdf",h="4pt",hash="",n=465,path="./p.pdf",w="6pt",},}\n');
	const other = withImages('c.lua', 'return {{file="q.pdf",h="4pt",hash="",n=172,path="./q.pdf",w="6pt",},}\n');
	expect(live.sameGround(moved, dir)).toBe(false);
	expect(live.sameGround(moved, dir, true)).toBe(true);
	expect(live.sameGround(other, dir, true)).toBe(false);
	fs.rmSync(dir, { recursive: true, force: true });
});
