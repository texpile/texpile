// caret stops of a textblock (7.1): every grapheme boundary of its text and both sides of every inline leaf
import type { Node as PMNode } from 'prosemirror-model';
import type { CaretStops } from '../contracts/geometryTypes';
import { graphemeBoundaries } from '../layout/text/graphemes';

const offsetsOf = new WeakMap<PMNode, readonly number[]>();

/** content offsets, ascending; never inside a surrogate pair or a cluster, generated text or a widget */
export function stopOffsets(textblock: PMNode): readonly number[] {
	const known = offsetsOf.get(textblock);
	if (known) return known;
	const stops = new Set<number>([0]);
	function walk(parent: PMNode, start: number): void {
		parent.forEach((child, offset) => {
			const at = start + offset;
			if (child.isText) for (const boundary of graphemeBoundaries(child.text!)) stops.add(at + boundary);
			else if (child.isAtom) stops.add(at).add(at + child.nodeSize);
			else {
				stops.add(at).add(at + child.nodeSize);
				walk(child, at + 1);
			}
		});
	}
	walk(textblock, 0);
	const sorted = [...stops].sort((a, b) => a - b);
	offsetsOf.set(textblock, sorted);
	return sorted;
}

/** textblockPos: the position before the textblock */
export function caretStopsOf(textblock: PMNode, textblockPos: number): CaretStops {
	return { textblock: textblockPos, positions: stopOffsets(textblock).map((offset) => textblockPos + 1 + offset) };
}
