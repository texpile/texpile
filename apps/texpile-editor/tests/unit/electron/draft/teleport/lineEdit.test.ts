import { it, expect } from 'vitest';
import { linesOf, lineEdit, lineShifts } from '../../../../../../../electron/src/draft/teleport/lineEdit';

// TeX ends a line at a lone carriage return too: counted as one line, every edit below it measured a line off
it('splits lines where the engine does', () => {
	expect(linesOf('a\r\nb\rc\nd\n')).toEqual(['a', 'b', 'c', 'd']);
	expect(lineEdit(linesOf('a\r\nb\r\n'), linesOf('a\r\nb\rx\r\n'))).toEqual({ from: 3, oldTo: 2, newTo: 3 });
});

// a cut run's paragraph and the next keystroke's deleted line went out as one span, and a figure from between them
// kept its old line on every page past the stop (1508.07931)
it('moves a line between two changes by the first alone', () => {
	const before = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
	const after = [...before];
	after.splice(24, 0, 'new', 'new');
	after.splice(9, 1);
	const shifts = lineShifts(before, after);
	expect(shifts).toEqual([
		{ after: 24, by: 2 },
		{ after: 10, by: -1 }
	]);
	const moved = (s: number) => shifts.reduce((l, m) => (l > m.after ? l + m.by : l), s);
	for (const s of [5, 15, 24, 25, 30]) expect(after[moved(s) - 1]).toBe(before[s - 1]);
});
