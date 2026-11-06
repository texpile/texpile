import { it, expect } from 'vitest';
import { linesOf, lineEdit } from '../../../../../../../electron/src/draft/teleport/lineEdit';

// TeX ends a line at a lone carriage return too: counted as one line, every edit below it measured a line off
it('splits lines where the engine does', () => {
	expect(linesOf('a\r\nb\rc\nd\n')).toEqual(['a', 'b', 'c', 'd']);
	expect(lineEdit(linesOf('a\r\nb\r\n'), linesOf('a\r\nb\rx\r\n'))).toEqual({ from: 3, oldTo: 2, newTo: 3 });
});
