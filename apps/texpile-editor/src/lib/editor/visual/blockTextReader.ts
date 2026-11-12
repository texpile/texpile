import type { Node as PMNode } from 'prosemirror-model';

export type TextReader = (from: number, to: number) => string;

/** The text between two places of `doc`, read inside the top-level block that holds them. Asked of the document,
 *  each run walks every block before it: 250 ms of every parse of a 140-page file */
export function blockTextReader(doc: PMNode): TextReader {
	const starts: number[] = [];
	let at = 0;
	doc.forEach((child) => {
		starts.push(at);
		at += child.nodeSize;
	});
	return (from, to) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= from) lo = mid;
			else hi = mid - 1;
		}
		const block = starts.length ? doc.child(lo) : null;
		const inside = block && from > starts[lo] && to < starts[lo] + block.nodeSize;
		return inside ? block.textBetween(from - starts[lo] - 1, to - starts[lo] - 1) : doc.textBetween(from, to);
	};
}
