import type { LayoutBoxBuilder, LineBox, LineFragment } from '../../../contracts/layoutTypes';

function movedFragment(fragment: LineFragment, delta: number): LineFragment {
	if (fragment.kind === 'text') return { ...fragment, from: fragment.from + delta, to: fragment.to + delta };
	if (fragment.kind === 'hyphen') return { ...fragment, at: fragment.at + delta };
	return fragment;
}

export function movedLines(lines: readonly LineBox[], delta: number): LineBox[] {
	return lines.map((line) => ({
		...line,
		from: line.from + delta,
		to: line.to + delta,
		fragments: line.fragments.map((fragment) => movedFragment(fragment, delta)),
		hyphen: line.hyphen && movedFragment(line.hyphen, delta)
	}));
}

/** a cell's plain boxes as they stand `delta` further into the block */
export function movedBoxes(boxes: readonly LayoutBoxBuilder[], delta: number): LayoutBoxBuilder[] {
	return boxes.map((box) => ({
		...box,
		node: box.node && { node: box.node.node, offset: box.node.offset + delta },
		lines: box.lines && movedLines(box.lines, delta),
		children: movedBoxes(box.children, delta)
	}));
}
