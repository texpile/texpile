import { it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { ShownTexts, type ReadSlice } from '$lib/editor/visual/find/shownTexts';

const N = schema.nodes;

// each keystroke in the find field drew every chip of the paper again, four seconds of a 1.9 MB one
it('reads each chip once per document, in idle slices', () => {
	const chips = Array.from({ length: 5 }, (_, i) => N.ref.create(null, schema.text(`r${i}`)));
	const doc = N.doc.create(null, [N.paragraph.create(null, chips)]);
	const reads: number[] = [];
	const slices: ((slice: ReadSlice) => void)[] = [];
	let reports = 0;
	const shown = new ShownTexts(
		(pos) => (reads.push(pos), `drawn ${pos}`),
		() => reports++,
		(task) => (slices.push(task), () => {})
	);
	shown.follow(doc);
	expect(reads).toEqual([]);
	expect(shown.textAt(doc, 1)).toBeUndefined();
	let budget = 2;
	while (slices.length) slices.shift()!({ timeRemaining: () => (budget-- > 0 ? 5 : 0) });
	expect(reads).toHaveLength(5);
	expect(shown.textAt(doc, 1)).toBe('drawn 1');
	expect(reports).toBeGreaterThan(0);
	shown.follow(doc);
	expect(slices).toHaveLength(0);
});
