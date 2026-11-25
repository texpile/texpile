import { describe, expect, it } from 'vitest';
import { backspaceStart, graphemeBoundaries } from '$lib/editor/canvas/layout/text/graphemes';

const FAMILY = '\u{1f468}‍\u{1f469}‍\u{1f467}';
const FLAG = '\u{1f1e9}\u{1f1ea}';

describe('graphemes', () => {
	it('stops the caret only between whole clusters', () => {
		expect(graphemeBoundaries(`é${FAMILY}x`)).toEqual([0, 2, 2 + FAMILY.length, 3 + FAMILY.length]);
		expect(graphemeBoundaries('क्ष')).toEqual([0, 3]);
	});

	it('deletes one code point on Backspace, and emoji sequences and flags whole, as Chromium does', () => {
		expect(backspaceStart(`é`, 2)).toBe(1);
		expect(backspaceStart('क्ष', 3)).toBe(2);
		expect(backspaceStart(`a${FAMILY}`, 1 + FAMILY.length)).toBe(1);
		expect(backspaceStart(`a${FLAG}`, 1 + FLAG.length)).toBe(1);
		expect(backspaceStart('a\u{1d400}', 3)).toBe(1);
	});
});
