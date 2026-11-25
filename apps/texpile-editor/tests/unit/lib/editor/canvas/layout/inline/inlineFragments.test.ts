import { it, expect } from 'vitest';
import { faceElement, type RunStyle } from '$lib/editor/canvas';
import { runStyleOf, type InlinePiece } from '$lib/editor/canvas/layout/inline/inlineContent';
import { placeLineFragments } from '$lib/editor/canvas/layout/inline/inlineFragments';
import { inlineItems } from '$lib/editor/canvas/layout/inline/inlineItems';
import { fixedStyles } from '../../testing/fixedStyles';

const styles = fixedStyles();
const style = styles.styleOf(faceElement('p'))!;
const run: RunStyle = runStyleOf(style);

it('spreads the room of a justified line between its ideographs so the line ends at the measure', () => {
	const text = '中文测试一二三四';
	const pieces: InlinePiece[] = [{ kind: 'text', from: 1, to: 1 + text.length, text, run, edgeStart: 0, edgeEnd: 0, struck: null }];
	const items = inlineItems(pieces, {
		measureText: (_, part) => [...part].length * 10,
		widthOf: () => 0,
		hyphenator: null,
		wholeWords: [],
		unbroken: null,
		splitWiderThan: Infinity,
		held: true,
		textblockOffset: 0
	});
	const glue = items.items.flatMap((item, i) => (item.kind === 'glue' && item.stretch < 1e5 ? [i] : []));
	const lines = placeLineFragments({
		chosen: { items, breaks: [glue[4], items.items.length - 1], sites: [] },
		pieces,
		objects: new Map(),
		measureText: (_, part) => [...part].length * 10,
		profile: { breaker: 'knuthPlass', justified: true, hyphenate: false },
		style: style.layout,
		widths: { first: 100, rest: 100 },
		lineLeft: () => 0,
		emptyAt: 1,
		tabAdvance: () => 0
	});
	const [first] = lines;
	const last = first.fragments.at(-1)!;
	expect([first.justified, last.x + last.width]).toEqual([true, 100]);
	expect(first.fragments.map((fragment) => fragment.kind === 'text' && [fragment.from, fragment.to])).toEqual(
		[1, 2, 3, 4, 5].map((from) => [from, from + 1])
	);
});
