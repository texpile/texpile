import { describe, expect, it } from 'vitest';
import type { BlockDisplayList, PaintOp } from '$lib/editor/canvas/paint/displayList';
import { inkChanges } from '$lib/editor/canvas/paint/displayListDiff';

function line(y: number, text: string): PaintOp {
	return { kind: 'text', x: 0, y, text, font: '400 20px Inter', color: '#000', spacing: '0px', rtl: false };
}

function list(over: PaintOp[], under: PaintOp[] = []): BlockDisplayList {
	return { under, over, outlines: [] };
}

describe('a display list against the one painted before', () => {
	const lines = [line(20, 'first line'), line(44, 'second line'), line(68, 'third line'), line(92, 'fourth line')];

	it('changes only around the lines whose text moved', () => {
		const typed = [lines[0], line(44, 'second linex'), line(68, 'x third line'), lines[3]];
		expect(inkChanges(list(lines), list(typed))).toEqual([{ from: 44 - 24, to: 68 + 12 }]);
		expect(inkChanges(list(lines), list(lines))).toEqual([]);
	});

	it('keeps a formula rebuilt for the same source, and repaints other replaced content rebuilt in place', () => {
		const style = { color: { r: 0, g: 0, b: 0, a: 1 } } as never;
		const formula = (): PaintOp => ({
			kind: 'replaced',
			content: { keys: [{ kind: 'math', key: 'latex x^2' }], intrinsic: () => null, paint: () => {} },
			box: { x: 40, y: 100, width: 30, height: 20 },
			style
		});
		const picture = (): PaintOp => ({
			kind: 'replaced',
			content: { intrinsic: () => null, paint: () => {} },
			box: { x: 0, y: 140, width: 200, height: 100 },
			style
		});
		expect(inkChanges(list([...lines, formula()]), list([...lines, formula()]))).toEqual([]);
		expect(inkChanges(list([...lines, picture()]), list([...lines, picture()]))).toEqual([{ from: 139, to: 241 }]);
	});

	it('repaints the whole block when a group around its ink changed', () => {
		const grouped = [{ kind: 'push', alpha: 0.5, clip: null } as PaintOp, ...lines, { kind: 'pop' } as PaintOp];
		expect(inkChanges(list(lines), list(grouped))).toBeNull();
	});
});
