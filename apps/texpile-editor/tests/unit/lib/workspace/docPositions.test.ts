// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { docPositions, resolvePosition, offsetToRowCol, rowColToOffset, type DocPosition } from '$lib/workspace/docPositions';

const ROOT = 'C:/papers/thesis';
const at = (p: string) => `${ROOT}/${p}`;

const pos = (row: number, column = 0, firstVisibleLine = 1) => ({ row, column, firstVisibleLine });

describe('docPositions', () => {
	beforeEach(() => {
		localStorage.clear();
		docPositions.bind(ROOT, true);
	});

	it('round-trips a position for a file under the root', () => {
		docPositions.set(at('main.tex'), pos(12, 4, 8));
		expect(docPositions.get(at('main.tex'))).toMatchObject({ row: 12, column: 4, firstVisibleLine: 8 });
	});

	it('survives a rebind, which is what makes it survive a restart', () => {
		docPositions.set(at('sections/intro.tex'), pos(40, 2, 33));
		docPositions.bind(null, false);
		expect(docPositions.get(at('sections/intro.tex'))).toBeNull();
		docPositions.bind(ROOT, true);
		expect(docPositions.get(at('sections/intro.tex'))).toMatchObject({ row: 40, column: 2 });
	});

	it('ignores paths outside the bound root, so a mid-switch path cannot leak in', () => {
		docPositions.set('D:/elsewhere/other.tex', pos(3));
		expect(docPositions.get('D:/elsewhere/other.tex')).toBeNull();
	});

	it('does not persist when the root is not persistable (guest sessions)', () => {
		docPositions.bind(ROOT, false);
		docPositions.set(at('main.tex'), pos(5));
		expect(localStorage.getItem('texpile:docPositions')).toBeNull();
	});

	it('follows a renamed file', () => {
		docPositions.set(at('old.tex'), pos(7, 1, 5));
		docPositions.rename(at('old.tex'), at('new.tex'));
		expect(docPositions.get(at('old.tex'))).toBeNull();
		expect(docPositions.get(at('new.tex'))).toMatchObject({ row: 7, column: 1 });
	});

	it('follows every entry under a renamed folder', () => {
		docPositions.set(at('parts/a.tex'), pos(1));
		docPositions.set(at('parts/deep/b.tex'), pos(2));
		docPositions.set(at('other.tex'), pos(3));
		docPositions.rename(at('parts'), at('chapters'));
		expect(docPositions.get(at('chapters/a.tex'))).toMatchObject({ row: 1 });
		expect(docPositions.get(at('chapters/deep/b.tex'))).toMatchObject({ row: 2 });
		expect(docPositions.get(at('other.tex'))).toMatchObject({ row: 3 }); // untouched
	});

	it('forgets a deleted file, and everything under a deleted folder', () => {
		docPositions.set(at('parts/a.tex'), pos(1));
		docPositions.set(at('parts/b.tex'), pos(2));
		docPositions.set(at('keep.tex'), pos(3));
		docPositions.forget(at('parts'));
		expect(docPositions.get(at('parts/a.tex'))).toBeNull();
		expect(docPositions.get(at('parts/b.tex'))).toBeNull();
		expect(docPositions.get(at('keep.tex'))).toMatchObject({ row: 3 });
	});

	// a sibling prefix must not be swept up with the folder: "parts2" is not inside "parts"
	it('does not forget a sibling whose name merely starts the same', () => {
		docPositions.set(at('parts/a.tex'), pos(1));
		docPositions.set(at('parts2/a.tex'), pos(2));
		docPositions.forget(at('parts'));
		expect(docPositions.get(at('parts2/a.tex'))).toMatchObject({ row: 2 });
	});

	it('evicts the least recently touched once past the cap', () => {
		for (let i = 0; i < 205; i++) docPositions.set(at(`f${i}.tex`), pos(i));
		expect(docPositions.get(at('f0.tex'))).toBeNull(); // oldest went
		expect(docPositions.get(at('f204.tex'))).toMatchObject({ row: 204 }); // newest stayed
	});

	it('drops malformed stored entries rather than handing back junk', () => {
		localStorage.setItem('texpile:docPositions', JSON.stringify({ [ROOT]: { 'bad.tex': { row: 'x' }, 'ok.tex': pos(9) } }));
		docPositions.bind(ROOT, true);
		expect(docPositions.get(at('bad.tex'))).toBeNull();
		expect(docPositions.get(at('ok.tex'))).toBeNull(); // no `at`, so also rejected
	});

	// the landing flash reads this: once, for the restore the jump caused, and never for the
	// ordinary tab switch that comes after it
	it('hands out a jump marker exactly once', () => {
		docPositions.set(at('main.tex'), pos(12), { jump: true });
		expect(docPositions.takeJump(at('main.tex'))).toBe(true);
		expect(docPositions.takeJump(at('main.tex'))).toBe(false);
	});

	it('lets a plain write to the same file cancel a jump that never landed', () => {
		docPositions.set(at('main.tex'), pos(12), { jump: true });
		docPositions.set(at('main.tex'), pos(13));
		expect(docPositions.takeJump(at('main.tex'))).toBe(false);
	});
});

describe('resolvePosition', () => {
	const doc = Text.of(['line one', 'line two', 'line three']);
	const stored = (p: ReturnType<typeof pos>): DocPosition => ({ ...p, at: 0 });

	it('resolves row/column to an offset', () => {
		const { cursor } = resolvePosition(stored(pos(1, 5)), doc);
		expect(doc.lineAt(cursor).number).toBe(2);
		expect(cursor - doc.line(2).from).toBe(5);
	});

	// the whole reason for storing line/column: a file that shrank while closed should land on the
	// last line, not be thrown away and dumped at the top
	it('clamps a row past the end onto the last line', () => {
		const { cursor } = resolvePosition(stored(pos(99)), doc);
		expect(doc.lineAt(cursor).number).toBe(3);
	});

	it('clamps a column past the end of its line', () => {
		const { cursor } = resolvePosition(stored(pos(0, 999)), doc);
		expect(cursor).toBe(doc.line(1).to);
	});

	it('clamps the scroll line too', () => {
		const { scroll } = resolvePosition(stored(pos(0, 0, 99)), doc);
		expect(doc.lineAt(scroll).number).toBe(3);
	});
});

// The visual editor stores its caret as line/column too, converting through these. A round trip has
// to be exact: a drift of one character per switch compounds into a wrong paragraph.
describe('offsetToRowCol / rowColToOffset', () => {
	const text = 'alpha\nbeta\n\ngamma delta';

	it('maps an offset to row/column', () => {
		expect(offsetToRowCol(text, 0)).toEqual({ row: 0, column: 0 });
		expect(offsetToRowCol(text, 3)).toEqual({ row: 0, column: 3 });
		expect(offsetToRowCol(text, 6)).toEqual({ row: 1, column: 0 });
		expect(offsetToRowCol(text, 11)).toEqual({ row: 2, column: 0 }); // the empty line
		expect(offsetToRowCol(text, 18)).toEqual({ row: 3, column: 6 });
	});

	it('round-trips every offset in the text', () => {
		for (let i = 0; i <= text.length; i++) {
			const { row, column } = offsetToRowCol(text, i);
			expect(rowColToOffset(text, row, column)).toBe(i);
		}
	});

	it('clamps an offset outside the text', () => {
		expect(offsetToRowCol(text, -5)).toEqual({ row: 0, column: 0 });
		expect(offsetToRowCol(text, 999)).toEqual(offsetToRowCol(text, text.length));
	});

	it('clamps a column past the end of its line', () => {
		expect(rowColToOffset(text, 0, 99)).toBe(5); // end of 'alpha', not into 'beta'
	});

	// a file that shrank while closed: land near where you were, not at the top
	it('clamps a row past the end onto the end of the text', () => {
		expect(rowColToOffset(text, 99, 0)).toBe(text.length);
	});

	it('handles a text with no newline at all', () => {
		expect(offsetToRowCol('solo', 2)).toEqual({ row: 0, column: 2 });
		expect(rowColToOffset('solo', 0, 2)).toBe(2);
		expect(rowColToOffset('solo', 1, 0)).toBe(4);
	});
});
