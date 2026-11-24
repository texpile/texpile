// display: flex and inline-flex (5.1): rows and columns, wrapping, order, reversed directions, grow and shrink by weight,
// justify-content, align-items (stretch, start, center, end, baseline) and auto margins
import type { LayoutBoxBuilder, LayoutInput } from '../../contracts/layoutTypes';
import type { LengthOr } from '../../contracts/styleTypes';
import { blockHeight, blockWidth, horizontalPadding, lengthPx } from '../blockFlow';

type Item = {
	readonly box: LayoutBoxBuilder;
	/** the main size before growing or shrinking, and the floor and ceiling it keeps to */
	basis: number;
	floor: number;
	ceiling: number;
	size: number;
	/** margins in the box's own orientation: left, right, top, bottom */
	margin: { left: number; right: number; top: number; bottom: number };
	auto: { left: boolean; right: boolean; top: boolean; bottom: boolean };
	cross: number;
};

function marginPx(margin: LengthOr<'auto'>, width: number): number {
	return margin === 'auto' ? 0 : lengthPx(margin, width);
}

/** where the free space puts the first item and the gap it leaves between items */
function justify(keyword: string, free: number, count: number): { start: number; between: number } {
	const value = keyword.replace(/^(safe|unsafe) /, '');
	const safe = keyword.startsWith('safe') || keyword === 'center';
	if (free < 0 && safe) return { start: 0, between: 0 };
	switch (value) {
		case 'center':
			return { start: free / 2, between: 0 };
		case 'flex-end':
		case 'end':
		case 'right':
			return { start: free, between: 0 };
		case 'space-between':
			return { start: 0, between: count > 1 ? Math.max(0, free) / (count - 1) : 0 };
		case 'space-around':
			return { start: Math.max(0, free) / count / 2, between: Math.max(0, free) / count };
		case 'space-evenly':
			return { start: Math.max(0, free) / (count + 1), between: Math.max(0, free) / (count + 1) };
		default:
			return { start: 0, between: 0 };
	}
}

function alignOf(container: LayoutBoxBuilder, box: LayoutBoxBuilder): string {
	const own = box.style.layout.flex.alignSelf;
	return own === 'auto' ? container.style.layout.flex.alignItems : own;
}

function ordered(children: readonly LayoutBoxBuilder[], reverse: boolean): LayoutBoxBuilder[] {
	const sorted = children.map((box, i) => ({ box, i })).sort((a, b) => a.box.style.layout.order - b.box.style.layout.order || a.i - b.i);
	const boxes = sorted.map(({ box }) => box);
	return reverse ? boxes.reverse() : boxes;
}

function itemOf(box: LayoutBoxBuilder, width: number, input: LayoutInput): Item {
	const style = box.style.layout;
	const { left, right, top, bottom } = style.margin;
	const own = input.intrinsic(box);
	const padding = horizontalPadding(style, width);
	const basis = style.flex.basis;
	// a percentage width resolves against the container, whose width is known here
	const sized = typeof style.width === 'object' ? lengthPx(style.width, width) : null;
	let main = own.max;
	if (basis !== 'auto' && basis !== 'content') main = lengthPx(basis, width) + (style.boxSizing === 'border-box' ? 0 : padding);
	else if (sized !== null) main = sized + (style.boxSizing === 'border-box' ? 0 : padding);
	const floor =
		style.minWidth === 'auto'
			? sized !== null
				? Math.min(main, own.min)
				: own.min
			: lengthPx(style.minWidth, width) + (style.boxSizing === 'border-box' ? 0 : padding);
	const ceiling = style.maxWidth === 'none' ? Infinity : lengthPx(style.maxWidth, width) + (style.boxSizing === 'border-box' ? 0 : padding);
	return {
		box,
		basis: Math.min(Math.max(main, floor), ceiling),
		floor,
		ceiling,
		size: 0,
		margin: { left: marginPx(left, width), right: marginPx(right, width), top: marginPx(top, width), bottom: marginPx(bottom, width) },
		auto: { left: left === 'auto', right: right === 'auto', top: top === 'auto', bottom: bottom === 'auto' },
		cross: 0
	};
}

/** the flexible lengths of one line (9.7): grow or shrink by weight, items that hit a floor or ceiling frozen at it */
function resolveLengths(items: Item[], room: number, gap: number): void {
	function outer(item: Item): number {
		return item.margin.left + item.margin.right;
	}
	const used = items.reduce((sum, item) => sum + item.basis + outer(item), 0) + gap * Math.max(0, items.length - 1);
	const growing = used < room;
	const frozen = new Set<Item>();
	for (const item of items) {
		const weight = growing ? item.box.style.layout.flex.grow : item.box.style.layout.flex.shrink;
		item.size = item.basis;
		if (weight === 0 || (growing ? item.basis > item.ceiling : item.basis < item.floor)) frozen.add(item);
	}
	for (let round = 0; round <= items.length && frozen.size < items.length; round++) {
		const free =
			room -
			gap * Math.max(0, items.length - 1) -
			items.reduce((sum, item) => sum + outer(item) + (frozen.has(item) ? item.size : item.basis), 0);
		const open = items.filter((item) => !frozen.has(item));
		function weight(item: Item): number {
			return growing ? item.box.style.layout.flex.grow : item.box.style.layout.flex.shrink * item.basis;
		}
		const total = open.reduce((sum, item) => sum + weight(item), 0);
		if (total === 0) break;
		const targets = open.map((item) => item.basis + (free * weight(item)) / total);
		const clamped = open.map((item, i) => Math.min(Math.max(targets[i], item.floor), item.ceiling));
		const violation = clamped.reduce((sum, size, i) => sum + size - targets[i], 0);
		for (const [i, item] of open.entries()) item.size = clamped[i];
		const settle = open.filter((_, i) => (violation === 0 ? true : violation > 0 ? clamped[i] > targets[i] : clamped[i] < targets[i]));
		for (const item of settle) frozen.add(item);
	}
}

function distributeAutoMargins(items: Item[], free: number): number {
	const autos = items.reduce((sum, item) => sum + +item.auto.left + +item.auto.right, 0);
	if (!autos || free <= 0) return free;
	const share = free / autos;
	for (const item of items) {
		if (item.auto.left) item.margin.left = share;
		if (item.auto.right) item.margin.right = share;
	}
	return 0;
}

/** the baseline an item aligns by: its first line, else the bottom of its box */
function baselineOf(item: Item): number {
	return item.margin.top + (item.box.baselines?.first ?? item.box.height);
}

function layoutRow(draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const style = draft.style.layout;
	const reverse = style.flex.direction === 'row-reverse';
	const wrapping = style.flex.wrap !== 'nowrap';
	const inner = {
		x: style.borderWidth.left + lengthPx(style.padding.left, input.width),
		y: style.borderWidth.top + lengthPx(style.padding.top, input.width)
	};
	const columnGap = lengthPx(style.gap.column, input.width);
	const rowGap = lengthPx(style.gap.row, input.width);
	const items = ordered(children, false).map((box) => itemOf(box, input.width, input));
	const lines: Item[][] = [];
	let line: Item[] = [];
	let taken = 0;
	for (const item of items) {
		const need = item.basis + item.margin.left + item.margin.right + (line.length ? columnGap : 0);
		if (wrapping && line.length && taken + need > input.width + 1e-6) {
			lines.push(line);
			line = [];
			taken = 0;
		}
		taken += item.basis + item.margin.left + item.margin.right + (line.length ? columnGap : 0);
		line.push(item);
	}
	if (line.length) lines.push(line);
	const single = lines.length === 1 && input.height !== null && !wrapping;
	const placed: { items: Item[]; free: number; cross: number; top: number }[] = [];
	for (const members of lines) {
		resolveLengths(members, input.width, columnGap);
		for (const item of members) {
			input.layout(item.box, item.size);
			item.cross = item.box.height + item.margin.top + item.margin.bottom;
		}
		const used =
			members.reduce((sum, item) => sum + item.size + item.margin.left + item.margin.right, 0) +
			columnGap * Math.max(0, members.length - 1);
		const free = distributeAutoMargins(members, input.width - used);
		const above = Math.max(0, ...members.filter((item) => /baseline/.test(alignOf(draft, item.box))).map(baselineOf));
		const below = Math.max(
			0,
			...members.filter((item) => /baseline/.test(alignOf(draft, item.box))).map((item) => item.cross - baselineOf(item))
		);
		const cross = single
			? input.height!
			: Math.max(above + below, ...members.map((item) => (/baseline/.test(alignOf(draft, item.box)) ? 0 : item.cross)));
		placed.push({ items: members, free, cross, top: above });
	}
	let y = inner.y;
	for (const [index, { items: members, free, cross, top: above }] of placed.entries()) {
		const { start, between } = justify(style.flex.justifyContent, free, members.length);
		let x = reverse ? input.width - start : start;
		for (const item of members) {
			const { box, margin } = item;
			const align = alignOf(draft, box);
			const room = cross - box.height - margin.top - margin.bottom;
			if (/baseline/.test(align)) box.y = y + above - (baselineOf(item) - margin.top);
			else {
				if (
					(align === 'normal' || align === 'stretch') &&
					box.style.layout.height === 'auto' &&
					!item.auto.top &&
					!item.auto.bottom &&
					box.kind !== 'replaced'
				)
					box.height = cross - margin.top - margin.bottom;
				const left = item.auto.top && item.auto.bottom ? room / 2 : item.auto.top ? room : 0;
				const offset = /center/.test(align) ? room / 2 : /(^|\s)(flex-end|end|self-end)$/.test(align) ? room : left;
				box.y = y + margin.top + Math.max(0, offset);
			}
			const width = item.size + margin.left + margin.right;
			box.x = inner.x + (reverse ? x - width + margin.left : x + margin.left);
			x += reverse ? -(width + columnGap + between) : width + columnGap + between;
		}
		y += cross + (index < placed.length - 1 ? rowGap : 0);
	}
	const content = placed.length ? y - inner.y : 0;
	draft.height = blockHeight(style, content, draft.width, { width: input.width, height: input.height });
	const first = placed[0]?.items.find((item) => item.box.baselines) ?? placed[0]?.items[0];
	if (first)
		draft.baselines = {
			first: first.box.y + (first.box.baselines?.first ?? first.box.height),
			last: first.box.y + (first.box.baselines?.last ?? first.box.height)
		};
}

/** a single column: items down the main axis apart by row-gap, stretched across unless aligned or sized */
function layoutColumn(draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const style = draft.style.layout;
	const inner = {
		x: style.borderWidth.left + lengthPx(style.padding.left, input.width),
		y: style.borderWidth.top + lengthPx(style.padding.top, input.width)
	};
	const gap = lengthPx(style.gap.row, 0);
	let y = inner.y;
	const boxes = ordered(children, style.flex.direction === 'column-reverse');
	for (const [i, child] of boxes.entries()) {
		const own = child.style.layout;
		const align = alignOf(draft, child);
		const stretch = align === 'normal' || align === 'stretch';
		const horizontal = blockWidth(own, input.width, () => input.intrinsic(child), !stretch);
		const top = marginPx(own.margin.top, input.width);
		const bottom = marginPx(own.margin.bottom, input.width);
		child.margin = { top, right: horizontal.marginRight, bottom, left: horizontal.marginLeft };
		input.layout(child, horizontal.width);
		const room = input.width - child.width - horizontal.marginLeft - horizontal.marginRight;
		const offset = stretch ? 0 : /center/.test(align) ? room / 2 : /(^|\s)(flex-end|end|self-end)$/.test(align) ? room : 0;
		child.x = inner.x + horizontal.marginLeft + Math.max(0, offset);
		child.y = y + (i ? gap : 0) + top;
		y = child.y + child.height + bottom;
	}
	draft.height = blockHeight(style, y - inner.y, draft.width, { width: input.width, height: input.height });
	const end = draft.height - style.borderWidth.bottom - lengthPx(style.padding.bottom, input.width);
	const { start, between } = justify(style.flex.justifyContent, end - y, boxes.length);
	for (const [i, box] of boxes.entries()) box.y += start + i * between;
	const first = boxes.find((box) => box.baselines);
	if (first) draft.baselines = { first: first.y + first.baselines!.first, last: first.y + first.baselines!.last };
}

export function layoutFlex(draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const style = draft.style.layout;
	if (style.flex.direction.startsWith('column')) layoutColumn(draft, children, input);
	else layoutRow(draft, children, input);
}

/** min-content and max-content widths of a flex container: a row's items side by side, a column's widest item */
export function flexIntrinsicWidths(
	draft: LayoutBoxBuilder,
	tools: { intrinsic(child: LayoutBoxBuilder): { min: number; max: number } }
): { min: number; max: number } {
	const style = draft.style.layout;
	const column = style.flex.direction.startsWith('column');
	const gap = lengthPx(style.gap.column, 0);
	let min = 0;
	let max = 0;
	for (const [i, child] of draft.children.entries()) {
		const own = tools.intrinsic(child);
		const margins = marginPx(child.style.layout.margin.left, 0) + marginPx(child.style.layout.margin.right, 0);
		if (column) {
			min = Math.max(min, own.min + margins);
			max = Math.max(max, own.max + margins);
		} else {
			// a wrapping row can break between items
			min = style.flex.wrap === 'nowrap' ? min + own.min + margins + (i ? gap : 0) : Math.max(min, own.min + margins);
			max += own.max + margins + (i ? gap : 0);
		}
	}
	return { min, max };
}
