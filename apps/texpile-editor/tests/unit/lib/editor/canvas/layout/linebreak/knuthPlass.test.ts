import { it, expect } from 'vitest';
import { breakLines, type LineItem } from '$lib/editor/canvas/layout/linebreak/knuthPlass';

const SPACE: LineItem = { kind: 'glue', width: 5, stretch: 2.5, shrink: 0 };
const END: LineItem[] = [
	{ kind: 'penalty', width: 0, cost: Infinity, flagged: false, fromPatterns: false },
	{ kind: 'glue', width: 0, stretch: 1e6, shrink: 0 },
	{ kind: 'penalty', width: 0, cost: -Infinity, flagged: false, fromPatterns: false }
];

function words(...widths: number[]): LineItem[] {
	return [...widths.flatMap((width, i): LineItem[] => (i ? [SPACE, { kind: 'box', width }] : [{ kind: 'box', width }])), ...END];
}

function lineWidths(items: LineItem[], breaks: number[]): number[] {
	const lines: number[] = [];
	let from = 0;
	for (const end of breaks) {
		let width = 0;
		for (let i = from; i < end; i++) {
			const item = items[i];
			if (item.kind !== 'penalty' && !(item.kind === 'glue' && (i === from || i === end))) width += item.width;
		}
		lines.push(width);
		from = end + 1;
	}
	return lines;
}

it('gives up a word early so that no line is left half empty', () => {
	// first fit takes 30 30 30 on line one, then 60 alone beside a 35 wide hole
	const items = words(30, 30, 30, 60, 90);
	const breaks = breakLines(items, { firstLineWidth: 100, lineWidth: 100, tolerance: Infinity, hyphenate: false })!;
	expect(lineWidths(items, breaks)).toEqual([65, 95, 90]);
});

it('splits a word at a pattern hyphen only in a pass that allows it', () => {
	const hyphen: LineItem = { kind: 'penalty', width: 4, cost: 50, flagged: true, fromPatterns: true };
	const items: LineItem[] = [{ kind: 'box', width: 60 }, SPACE, { kind: 'box', width: 30 }, hyphen, { kind: 'box', width: 40 }, ...END];
	const pass = { firstLineWidth: 100, lineWidth: 100, tolerance: Infinity };
	expect(breakLines(items, { ...pass, hyphenate: false })).toEqual([1, items.length - 1]);
	expect(breakLines(items, { ...pass, hyphenate: true })).toEqual([3, items.length - 1]);
});

it('leaves a line that is already there alone and breaks only what follows it', () => {
	// on its own it would end line one after the second word; told line one ends after the third, it keeps that
	const items = words(30, 30, 30, 60, 90);
	const breaks = breakLines(items, { firstLineWidth: 100, lineWidth: 100, tolerance: Infinity, hyphenate: false }, 5)!;
	expect(lineWidths(items, [5, ...breaks])).toEqual([100, 60, 90]);
});

it('fills the lines of text with almost nothing to stretch when given emergency stretch', () => {
	// Thai: one space in the whole paragraph, every other break between dictionary words with no room in it
	const between: LineItem = { kind: 'penalty', width: 0, cost: 0, flagged: false, fromPatterns: false };
	const items: LineItem[] = [{ kind: 'box', width: 70 }, SPACE, { kind: 'box', width: 40 }];
	for (const width of [60, 50, 45, 55, 40, 60, 50, 45, 55, 40]) items.push(between, { kind: 'box', width });
	items.push(...END);
	const pass = { firstLineWidth: 200, lineWidth: 200, tolerance: Infinity, hyphenate: false, emergencyStretch: 40 };
	const breaks = breakLines(items, pass)!;
	expect(
		lineWidths(items, breaks)
			.slice(0, -1)
			.every((w) => w >= 150)
	).toBe(true);
});

it('finds nothing when a word is wider than the line', () => {
	expect(breakLines(words(40, 140, 40), { firstLineWidth: 100, lineWidth: 100, tolerance: Infinity, hyphenate: false })).toBeNull();
});
