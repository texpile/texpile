import { expect, it } from 'vitest';
import { tradedWidths } from '$lib/editor/visual/extensions/table/canvas/columnResize';
import { snapWidthToFr } from '$lib/editor/visual/extensions/table/snapWidth';

const snap = (raw: number) => snapWidthToFr(raw, { tableWidth: 800, columns: 2 });

it('a dragged border trades width with the next column in quarter-fr steps, each kept at least one step', () => {
	expect(tradedWidths([400, 400], 70, snap)).toEqual([500, 300]);
	expect(tradedWidths([400, 400], 1000, snap)).toEqual([700, 100]);
	expect(tradedWidths([400, 400], -1000, snap)).toEqual([100, 700]);
});
