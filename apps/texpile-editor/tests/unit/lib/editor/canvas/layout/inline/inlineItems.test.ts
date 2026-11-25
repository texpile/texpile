import { it, expect } from 'vitest';
import { faceElement, type RunStyle } from '$lib/editor/canvas';
import { runStyleOf, type InlinePiece } from '$lib/editor/canvas/layout/inline/inlineContent';
import { inlineItems } from '$lib/editor/canvas/layout/inline/inlineItems';
import { fixedStyles } from '../../testing/fixedStyles';

const styles = fixedStyles();
const atom = faceElement('span', 'citation');
const atomStyle = styles.styleOf(atom)!;
const run: RunStyle = runStyleOf(styles.styleOf(faceElement('p'))!);

function pieces(): InlinePiece[] {
	return [
		{ kind: 'text', from: 1, to: 5, text: 'see ', run, edgeStart: 0, edgeEnd: 0, struck: null },
		{ kind: 'text', from: 5, to: 9, text: 'word', run, edgeStart: 0, edgeEnd: 0, struck: null },
		{ kind: 'object', at: 9, size: 1, element: atom, style: atomStyle, side: null },
		{ kind: 'text', from: 10, to: 14, text: 'next', run, edgeStart: 0, edgeEnd: 0, struck: null }
	];
}

function breaksBetween(held: boolean): string[] {
	const built = inlineItems(pieces(), {
		measureText: (_, text) => text.length * 10,
		widthOf: () => 30,
		hyphenator: null,
		wholeWords: [],
		unbroken: null,
		splitWiderThan: Infinity,
		held,
		textblockOffset: 0
	});
	return built.items.flatMap((item, i) => {
		const [from] = built.ranges[i];
		const breakable = (item.kind === 'glue' && built.items[i - 1]?.kind === 'box') || (item.kind === 'penalty' && item.cost < Infinity);
		return breakable ? [built.text.slice(0, from)] : [];
	});
}

it('holds an inline node to the words beside it in a held paragraph (D10)', () => {
	expect(breaksBetween(true)).toEqual(['see', 'see wordxnext']);
});

it('lets a line end on either side of an atomic inline in a greedy block', () => {
	expect(breaksBetween(false)).toEqual(['see', 'see word', 'see word￼', 'see word￼next']);
});

it('measures a word that splits anywhere by its pieces, never by growing prefixes', () => {
	const word = 'abcdefghij'.repeat(100);
	const measured: string[] = [];
	inlineItems([{ kind: 'text', from: 1, to: 1001, text: word, run, edgeStart: 0, edgeEnd: 0, struck: null }], {
		measureText: (_, text) => (measured.push(text), text.length * 10),
		widthOf: () => 0,
		hyphenator: null,
		wholeWords: [],
		unbroken: null,
		splitWiderThan: 100,
		held: true,
		textblockOffset: 0
	});
	expect(measured.reduce((sum, text) => sum + text.length, 0)).toBeLessThan(word.length * 3);
});
