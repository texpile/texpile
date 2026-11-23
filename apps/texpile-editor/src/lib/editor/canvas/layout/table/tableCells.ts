// a cell measured and laid out under its used borders, which a collapsed table halves, and its content aligned in its row
import type { LayoutBoxBuilder, LayoutInput, LineBox } from '../../contracts/layoutTypes';
import type { ComputedStyle, Edges } from '../../contracts/styleTypes';
import { carryTableState } from './tableState';
import type { IntrinsicWidths } from './tableIntrinsic';

const underBorders = new WeakMap<ComputedStyle, { borders: Edges<number>; style: ComputedStyle }[]>();

function sameBorders(a: Edges<number>, b: Edges<number>): boolean {
	return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/** the style as if its borders were the used ones; every cell of a table shares one */
function styleUnder(own: ComputedStyle, used: Edges<number>): ComputedStyle {
	let known = underBorders.get(own);
	if (!known) underBorders.set(own, (known = []));
	const found = known.find((each) => sameBorders(each.borders, used));
	if (found) return found.style;
	const style = { ...own, layout: { ...own.layout, borderWidth: used } };
	known.push({ borders: { ...used }, style });
	return style;
}

/** runs `work` with the box laid out as if its borders were the used ones, then gives it its own style back */
function underUsedBorders<T>(draft: LayoutBoxBuilder, used: Edges<number>, work: () => T): T {
	const own: ComputedStyle = draft.style;
	if (sameBorders(own.layout.borderWidth, used)) return work();
	draft.style = styleUnder(own, used);
	try {
		return work();
	} finally {
		draft.style = own;
	}
}

export function measureCell(box: LayoutBoxBuilder, used: Edges<number>, input: Pick<LayoutInput, 'intrinsic'>): IntrinsicWidths {
	return underUsedBorders(box, used, () => input.intrinsic(box));
}

export function layoutCell(box: LayoutBoxBuilder, width: number, used: Edges<number>, input: Pick<LayoutInput, 'layout'>): void {
	underUsedBorders(box, used, () => input.layout(box, width));
}

function lowered(box: LayoutBoxBuilder, dy: number): LayoutBoxBuilder {
	const copy = { ...box, y: box.y + dy };
	carryTableState(box, copy);
	return copy;
}

function shiftLine(line: LineBox, dy: number): LineBox {
	const fragments = line.fragments.map((fragment) =>
		(fragment.kind === 'atomic' || fragment.kind === 'widget') && fragment.box
			? { ...fragment, box: lowered(fragment.box as LayoutBoxBuilder, dy) }
			: fragment
	);
	return { ...line, fragments, y: line.y + dy, baseline: line.baseline + dy, textTop: line.textTop + dy, textBottom: line.textBottom + dy };
}

/** moves the cell's content down inside its border box, as vertical-align places it in the row; boxes a reused line shares are copied */
export function shiftCellContent(draft: LayoutBoxBuilder, dy: number): void {
	if (!dy) return;
	draft.children = draft.children.map((child) => (child.style.layout.position === 'absolute' ? child : lowered(child, dy)));
	if (draft.lines) draft.lines = draft.lines.map((line) => shiftLine(line, dy));
	if (draft.baselines) draft.baselines = { first: draft.baselines.first + dy, last: draft.baselines.last + dy };
}

/** the cell's absolute boxes follow its border box as the row stretches it: one hung on its bottom edge moves, one hung on both grows */
export function stretchCellAbsolutes(draft: LayoutBoxBuilder, grow: number): void {
	if (!grow) return;
	for (const child of draft.children) {
		const { position, inset, height } = child.style.layout;
		if (position !== 'absolute' || inset.bottom === 'auto') continue;
		if (inset.top !== 'auto' && height === 'auto') child.height += grow;
		else if (inset.top === 'auto') child.y += grow;
	}
}
