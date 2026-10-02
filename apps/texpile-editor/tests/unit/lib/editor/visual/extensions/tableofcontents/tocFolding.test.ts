import { it, expect } from 'vitest';
import {
	tocFoldedNow,
	tocHasChildren,
	tocKeys,
	tocLineage,
	tocShownActive,
	tocVisible
} from '$lib/editor/visual/extensions/tableofcontents/tocFolding';
import type { TocItem } from '$lib/editor/visual/extensions/tableofcontents/tocStore';

const outline: TocItem[] = [
	{ level: 1, text: 'Introduction', pos: 0 },
	{ level: 1, text: 'Related Work', pos: 10 },
	{ level: 2, text: 'Benchmarks', pos: 20 },
	{ level: 3, text: 'Executable', pos: 30 },
	{ level: 2, text: 'Repair', pos: 40 },
	{ level: 1, text: 'Results', pos: 50 }
];

it('folds a section down to its next sibling, and marks the folded heading for a caret hidden under it', () => {
	const keys = tocKeys(outline);
	expect(tocHasChildren(outline)).toEqual([false, true, true, false, false, false]);
	const visible = tocVisible(outline, keys, new Set([keys[1]]));
	expect(visible).toEqual([true, true, false, false, false, true]);
	expect(tocShownActive(outline, visible, 3)).toBe(1);
	// a fold inside an open section hides only its own rows
	expect(tocVisible(outline, keys, new Set([keys[2]]))).toEqual([true, true, true, false, true, true]);
	// what opens when the caret moves into Executable: it and the sections it sits in
	expect(tocLineage(outline, 3)).toEqual([3, 2, 1]);
});

it("opens the reader's folds the caret is in only while it is there, unless folded again there", () => {
	const keys = tocKeys(outline);
	const folded = new Set([keys[1], keys[2]]);
	const inExecutable = tocLineage(outline, 3).map((i) => keys[i]);
	expect([...tocFoldedNow(folded, inExecutable, new Set())]).toEqual([]);
	expect([...tocFoldedNow(folded, inExecutable, new Set([keys[2]]))]).toEqual([keys[2]]);
	// the caret gone on to Results: both are folded again
	expect([...tocFoldedNow(folded, [keys[5]], new Set())]).toEqual([keys[1], keys[2]]);
});
