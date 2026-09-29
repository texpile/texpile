// A folder of new files nobody means to save (a venv, a data dump) is one row, not thousands.
import { it, expect } from 'vitest';
import { sep } from 'node:path';
import { collapseUntracked, capRows } from '../../../../../../electron/src/git/gitStatusLimit';

const P = (...parts: string[]) => ['', 'p', ...parts].join(sep);
const neu = (path: string) => ({ path, x: '?', y: '?' });

it('turns a big folder of new files into one row that counts them, where its first file was', () => {
	const entries = [
		{ path: P('a.tex'), x: ' ', y: 'M' },
		...Array.from({ length: 5 }, (_, i) => neu(P('venv', `f${i}.py`))),
		neu(P('notes.txt'))
	];
	expect(collapseUntracked(entries, [P('venv') + sep], 3)).toEqual([
		{ path: P('a.tex'), x: ' ', y: 'M' },
		{ path: P('venv'), x: '?', y: '?', files: 5 },
		neu(P('notes.txt'))
	]);
});

it('leaves a small folder of new files as its files, and never folds a changed tracked file', () => {
	const entries = [neu(P('figs', 'a.png')), neu(P('figs', 'b.png'))];
	expect(collapseUntracked(entries, [P('figs')], 3)).toBe(entries);
	// a folder git calls wholly new holds no tracked files, but the check is by status all the same
	const mixed = [{ path: P('d', 'kept.tex'), x: ' ', y: 'M' }, ...[1, 2, 3].map((i) => neu(P('d', `${i}`)))];
	expect(collapseUntracked(mixed, [P('d')], 3)).toEqual([mixed[0], { path: P('d'), x: '?', y: '?', files: 3 }]);
});

it('cuts a list past the cap and says how long it was', () => {
	expect(capRows([1, 2, 3], undefined, 5)).toEqual({ rows: [1, 2, 3] });
	expect(capRows([1, 2, 3, 4, 5, 6], undefined, 5)).toEqual({ rows: [1, 2, 3, 4, 5], truncated: 6 });
});

it('never cuts a conflict, however far down the list it is', () => {
	// the panel counts conflicts to know whether a merge can be finished
	const conflict = (n: number) => n % 10 === 0;
	expect(capRows([1, 2, 3, 4, 5, 6, 10, 20], conflict, 5)).toEqual({ rows: [1, 2, 3, 10, 20], truncated: 8 });
	expect(capRows([1, 10, 20, 30], conflict, 2)).toEqual({ rows: [10, 20, 30], truncated: 4 });
});
