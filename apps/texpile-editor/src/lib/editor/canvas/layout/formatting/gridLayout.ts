// display: grid and inline-grid: explicit and implicit tracks, items on named lines or placed in reading order (5.1)
import type { LayoutBoxBuilder, LayoutInput } from '../../contracts/layoutTypes';
import type { LayoutStyle, LengthOr } from '../../contracts/styleTypes';
import { blockHeight, blockWidth, lengthPx } from '../blockFlow';
import { placeGridItems, type GridCell } from './gridPlacement';
import { parseTrackList, sizeGridTracks, type GridItemSizes, type TrackSize } from './gridTracks';

const AUTO: TrackSize = { kind: 'auto' };

type GridPlan = {
	readonly cells: readonly GridCell[];
	readonly columns: readonly TrackSize[];
	readonly rows: readonly TrackSize[];
};

function marginPx(value: number | 'auto'): number {
	return value === 'auto' ? 0 : value;
}

function marginAt(value: LengthOr<'auto'>, width: number): number {
	return value === 'auto' ? 0 : lengthPx(value, width);
}

function sideMargins(child: LayoutBoxBuilder, width: number) {
	const own = child.style.layout.margin;
	return {
		left: marginAt(own.left, width),
		right: marginAt(own.right, width),
		top: marginAt(own.top, width),
		bottom: marginAt(own.bottom, width)
	};
}

/** the items' cells and every track, the implicit ones after the explicit */
function planGrid(style: LayoutStyle, children: readonly LayoutBoxBuilder[], width: number, height: number | null): GridPlan {
	const fontPx = style.font.sizePx;
	const columnGap = lengthPx(style.gap.column, width);
	const rowGap = lengthPx(style.gap.row, width);
	const explicitColumns = parseTrackList(style.grid.templateColumns, { available: width, fontPx, gap: columnGap });
	const explicitRows = parseTrackList(style.grid.templateRows, { available: height, fontPx, gap: rowGap });
	const cells = placeGridItems({
		items: children.map((child) => ({ column: child.style.layout.grid.column, row: child.style.layout.grid.row })),
		explicitColumns: explicitColumns.length,
		explicitRows: explicitRows.length,
		byColumn: style.grid.autoFlow.startsWith('column')
	});
	function implicit(template: string, explicit: readonly TrackSize[], used: number, available: number | null, gap: number): TrackSize[] {
		const pattern = parseTrackList(template, { available, fontPx, gap });
		const extra = Array.from({ length: Math.max(0, used - explicit.length) }, (_, i) =>
			pattern.length ? pattern[i % pattern.length] : AUTO
		);
		return [...explicit, ...extra];
	}
	const columnCount = Math.max(0, ...cells.map((cell) => cell.column + cell.columnSpan));
	const rowCount = Math.max(0, ...cells.map((cell) => cell.row + cell.rowSpan));
	return {
		cells,
		columns: implicit(style.grid.autoColumns, explicitColumns, columnCount, width, columnGap),
		rows: implicit(style.grid.autoRows, explicitRows, rowCount, height, rowGap)
	};
}

function offsetsOf(sizes: readonly number[], gap: number): number[] {
	let at = 0;
	return sizes.map((size) => {
		const start = at;
		at += size + gap;
		return start;
	});
}

function spanSize(sizes: readonly number[], start: number, span: number, gap: number): number {
	let total = gap * (span - 1);
	for (let i = start; i < start + span; i++) total += sizes[i] ?? 0;
	return total;
}

/** how far a keyword moves an item inside a track it does not fill */
function shift(keyword: string, room: number): number {
	if (room <= 0) return 0;
	if (/center/.test(keyword)) return room / 2;
	return /(^|\s)(end|flex-end|self-end|right)$/.test(keyword) ? room : 0;
}

function stretches(keyword: string, replaced: boolean): boolean {
	return keyword === 'stretch' || (keyword === 'normal' && !replaced);
}

export function layoutGrid(draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const style = draft.style.layout;
	const left = style.borderWidth.left + lengthPx(style.padding.left, input.width);
	const top = style.borderWidth.top + lengthPx(style.padding.top, input.width);
	const columnGap = lengthPx(style.gap.column, input.width);
	const rowGap = lengthPx(style.gap.row, input.width);
	const plan = planGrid(style, children, input.width, input.height);
	const columnItems: GridItemSizes[] = children.map((child, i) => {
		const cell = plan.cells[i];
		const own = input.intrinsic(child);
		const margins = sideMargins(child, input.width);
		const extra = margins.left + margins.right;
		return { start: cell.column, span: cell.columnSpan, min: own.min + extra, max: own.max + extra };
	});
	const columnSizes = sizeGridTracks(plan.columns, input.width, columnGap, columnItems);
	const columnAt = offsetsOf(columnSizes, columnGap);
	const heights: number[] = [];
	for (const [i, child] of children.entries()) {
		const cell = plan.cells[i];
		const area = spanSize(columnSizes, cell.column, cell.columnSpan, columnGap);
		const margins = sideMargins(child, area);
		const own = child.style.layout;
		const justify = own.grid.justifySelf === 'auto' ? style.grid.justifyItems : own.grid.justifySelf;
		const horizontal = blockWidth(own, area, () => input.intrinsic(child), !stretches(justify, child.kind === 'replaced'));
		child.margin = { top: margins.top, right: horizontal.marginRight, bottom: margins.bottom, left: horizontal.marginLeft };
		input.layout(child, horizontal.width);
		heights.push(child.height + margins.top + margins.bottom);
	}
	const rowItems: GridItemSizes[] = children.map((_, i) => ({
		start: plan.cells[i].row,
		span: plan.cells[i].rowSpan,
		min: heights[i],
		max: heights[i]
	}));
	const rowSizes = sizeGridTracks(plan.rows, input.height, rowGap, rowItems);
	const rowAt = offsetsOf(rowSizes, rowGap);
	for (const [i, child] of children.entries()) {
		const cell = plan.cells[i];
		const own = child.style.layout;
		const areaWidth = spanSize(columnSizes, cell.column, cell.columnSpan, columnGap);
		const areaHeight = spanSize(rowSizes, cell.row, cell.rowSpan, rowGap);
		const replaced = child.kind === 'replaced';
		const justify = own.grid.justifySelf === 'auto' ? style.grid.justifyItems : own.grid.justifySelf;
		const align = own.flex.alignSelf === 'auto' ? style.flex.alignItems : own.flex.alignSelf;
		const vertical = marginPx(child.margin.top) + marginPx(child.margin.bottom);
		if (stretches(align, replaced) && own.height === 'auto') child.height = Math.max(child.height, areaHeight - vertical);
		const roomX = areaWidth - child.width - child.margin.left - child.margin.right;
		const roomY = areaHeight - child.height - vertical;
		child.x = left + columnAt[cell.column] + child.margin.left + shift(justify, roomX);
		child.y = top + rowAt[cell.row] + child.margin.top + shift(align, roomY);
	}
	const content = rowSizes.reduce((sum, size) => sum + size, 0) + rowGap * Math.max(0, rowSizes.length - 1);
	draft.height = blockHeight(style, content, draft.width, { width: input.width, height: input.height });
}

/** min-content and max-content widths of a grid: its tracks sized by the items' own */
export function gridIntrinsicWidths(
	draft: LayoutBoxBuilder,
	tools: { intrinsic(child: LayoutBoxBuilder): { min: number; max: number } }
): { min: number; max: number } {
	const style = draft.style.layout;
	const columnGap = lengthPx(style.gap.column, 0);
	const plan = planGrid(style, draft.children, 0, null);
	function items(pick: 'min' | 'max'): GridItemSizes[] {
		return draft.children.map((child, i) => {
			const size = tools.intrinsic(child)[pick] + sideMargins(child, 0).left + sideMargins(child, 0).right;
			return { start: plan.cells[i].column, span: plan.cells[i].columnSpan, min: size, max: size };
		});
	}
	function total(sizes: readonly number[]): number {
		return sizes.reduce((sum, size) => sum + size, 0) + columnGap * Math.max(0, sizes.length - 1);
	}
	return {
		min: total(sizeGridTracks(plan.columns, null, columnGap, items('min'))),
		max: total(sizeGridTracks(plan.columns, null, columnGap, items('max')))
	};
}
