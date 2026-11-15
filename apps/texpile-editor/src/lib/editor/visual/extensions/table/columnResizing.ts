// Column resizing, vendored from prosemirror-tables 1.8.5 (src/columnresizing.ts) so the drag can
// SNAP. Everything else - TableMap, TableView, the commands, the selection model - still comes from
// the package; only this one module is ours.
//
// Copyright (C) 2015-2016 by Marijn Haverbeke <marijnh@gmail.com> and others. MIT licensed; see
// node_modules/prosemirror-tables/LICENSE. Kept deliberately close to upstream so a future version
// can be diffed against it. Every change from the original is marked TEXPILE.
//
// Why vendor rather than wrap: the upstream drag runs on window listeners registered inside
// handleMouseDown, which also returns true - so no plugin hook survives to adjust the preview.
// Wrapping it meant registering a competing window listener behind theirs and repainting every
// mousemove, which depended on undocumented listener ordering, read the plugin's private state
// shape, and duplicated the width formula. All of that failed silently. One snap option in the file
// that owns the drag replaces the lot.
import type { Attrs, Node as ProsemirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
// TEXPILE: upstream imports these from sibling files; they are all public exports of the package,
// so the vendored copy stops at this one module
import { TableMap, TableView, updateColumnsOnResize, cellAround, pointsAtCell, tableNodeTypes } from 'prosemirror-tables';

/** TEXPILE: upstream's util.ts CellAttrs, which the package declares but does not export. */
type CellAttrs = {
	colspan: number;
	rowspan: number;
	colwidth: number[] | null;
};

export const columnResizingPluginKey = new PluginKey<ResizeState>('tableColumnResizing');

export type Dragging = {
	startX: number;
	startWidth: number;
	/** TEXPILE: splitter mode - the column to the right, which gives up whatever this one takes */
	neighbourCol?: number;
	neighbourStartWidth?: number;
};

/** TEXPILE: what a snap function is told about the table being dragged. */
export type SnapContext = {
	/** the table's rendered width in px */
	tableWidth: number;
	/** grid columns, spans counted */
	columns: number;
};

export type ColumnResizingOptions = {
	handleWidth?: number;
	cellMinWidth?: number;
	defaultCellMinWidth?: number;
	lastColumnResizable?: boolean;
	View?: (new (node: ProsemirrorNode, cellMinWidth: number, view: EditorView) => NodeView) | null;
	/**
	 * TEXPILE: quantise a dragged width. Applied to the live preview AND to the committed value, so
	 * the column never moves on release. Omit for upstream's continuous behaviour.
	 */
	snap?: (rawWidth: number, ctx: SnapContext) => number;
	/**
	 * TEXPILE: resize as a SPLITTER - whatever the dragged column gains, the column to its right
	 * gives up, so the table's total width never changes.
	 *
	 * Upstream resizes one column in isolation, which is right when widths are absolute pixels: the
	 * table grows and the wrapper scrolls. It is wrong when widths are proportional. Typst writes
	 * these as `fr`, a share of the available space, and a share cannot overflow - an all-fr table
	 * always exactly fills the text block. Letting the editor grow past its pane shows a layout the
	 * compiled document can never produce.
	 *
	 * Implies lastColumnResizable: false. The final column's right edge is the table edge, and with
	 * a fixed total there is nothing beyond it to take space from.
	 */
	redistribute?: boolean;
};

export function columnResizing({
	handleWidth = 5,
	cellMinWidth = 25,
	defaultCellMinWidth = 100,
	// eslint-disable-next-line @typescript-eslint/naming-convention -- upstream prosemirror-tables option name
	View = TableView,
	lastColumnResizable = true,
	snap,
	redistribute = false
}: ColumnResizingOptions = {}): Plugin {
	// TEXPILE: with a fixed total there is nothing to the right of the last column to trade with
	const lastResizable = redistribute ? false : lastColumnResizable;
	const plugin = new Plugin<ResizeState>({
		key: columnResizingPluginKey,
		state: {
			init(_, state) {
				const nodeViews = plugin.spec?.props?.nodeViews;
				const tableName = tableNodeTypes(state.schema).table.name;
				if (View && nodeViews) {
					nodeViews[tableName] = (node, view) => new View(node, defaultCellMinWidth, view);
				}
				return new ResizeState(-1, false);
			},
			apply(tr, prev) {
				return prev.apply(tr);
			}
		},
		props: {
			attributes: (state): Record<string, string> => {
				const pluginState = columnResizingPluginKey.getState(state);
				return pluginState && pluginState.activeHandle > -1 ? { class: 'resize-cursor' } : {};
			},
			handleDOMEvents: {
				mousemove: (view, event) => {
					handleMouseMove(view, event, handleWidth, lastResizable);
				},
				mouseleave: (view) => {
					handleMouseLeave(view);
				},
				mousedown: (view, event) => {
					handleMouseDown(view, event, cellMinWidth, defaultCellMinWidth, snap, redistribute);
				}
			},
			decorations: (state) => {
				const pluginState = columnResizingPluginKey.getState(state);
				if (pluginState && pluginState.activeHandle > -1) return handleDecorations(state, pluginState.activeHandle);
			},
			nodeViews: {}
		}
	});
	return plugin;
}

export class ResizeState {
	constructor(
		public activeHandle: number,
		public dragging: Dragging | false
	) {}

	apply(tr: Transaction): ResizeState {
		// TEXPILE: upstream aliases `this` here and disables the lint rule; `this` reads fine
		const action = tr.getMeta(columnResizingPluginKey);
		if (action && action.setHandle != null) return new ResizeState(action.setHandle, false);
		if (action && action.setDragging !== undefined) return new ResizeState(this.activeHandle, action.setDragging);
		if (this.activeHandle > -1 && tr.docChanged) {
			let handle = tr.mapping.map(this.activeHandle, -1);
			if (!pointsAtCell(tr.doc.resolve(handle))) handle = -1;
			return new ResizeState(handle, this.dragging);
		}
		return this;
	}
}

function handleMouseMove(view: EditorView, event: MouseEvent, handleWidth: number, lastColumnResizable: boolean): void {
	if (!view.editable) return;
	const pluginState = columnResizingPluginKey.getState(view.state);
	if (!pluginState) return;

	if (!pluginState.dragging) {
		const target = domCellAround(event.target as HTMLElement);
		let cell = -1;
		if (target) {
			const { left, right } = target.getBoundingClientRect();
			if (event.clientX - left <= handleWidth) cell = edgeCell(view, event, 'left', handleWidth);
			else if (right - event.clientX <= handleWidth) cell = edgeCell(view, event, 'right', handleWidth);
		}

		if (cell != pluginState.activeHandle) {
			if (!lastColumnResizable && cell !== -1) {
				const $cell = view.state.doc.resolve(cell);
				const table = $cell.node(-1);
				const map = TableMap.get(table);
				const tableStart = $cell.start(-1);
				const col = map.colCount($cell.pos - tableStart) + $cell.nodeAfter!.attrs.colspan - 1;
				if (col == map.width - 1) return;
			}
			updateHandle(view, cell);
		}
	}
}

function handleMouseLeave(view: EditorView): void {
	if (!view.editable) return;
	const pluginState = columnResizingPluginKey.getState(view.state);
	if (pluginState && pluginState.activeHandle > -1 && !pluginState.dragging) updateHandle(view, -1);
}

/** TEXPILE: the table element and grid width a snap function needs, measured once per drag. */
function snapContext(view: EditorView, cell: number): SnapContext | null {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1);
	if (!table) return null;
	let dom: Node | null = view.domAtPos($cell.start(-1)).node;
	while (dom && dom.nodeName != 'TABLE') dom = dom.parentNode;
	if (!dom) return null;
	const tableWidth = (dom as HTMLTableElement).getBoundingClientRect().width;
	return tableWidth > 0 ? { tableWidth, columns: TableMap.get(table).width } : null;
}

/** TEXPILE: the grid column a handle sits on. */
function columnOf(view: EditorView, cell: number): number {
	const $cell = view.state.doc.resolve(cell);
	const map = TableMap.get($cell.node(-1));
	return map.colCount($cell.pos - $cell.start(-1)) + $cell.nodeAfter!.attrs.colspan - 1;
}

/** TEXPILE: the column immediately right of the handle, with its current rendered width. */
function neighbourColumn(view: EditorView, cell: number): { col: number; width: number } | null {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1);
	const map = TableMap.get(table);
	const start = $cell.start(-1);
	const col = columnOf(view, cell) + 1;
	if (col >= map.width) return null; // last column: the table edge, nothing to trade with
	const pos = map.map[col];
	const node = table.nodeAt(pos);
	if (!node) return null;
	return { col, width: currentColWidth(view, start + pos, node.attrs) };
}

function handleMouseDown(
	view: EditorView,
	event: MouseEvent,
	cellMinWidth: number,
	defaultCellMinWidth: number,
	snap?: (rawWidth: number, ctx: SnapContext) => number,
	redistribute = false
): boolean {
	if (!view.editable) return false;

	const win = view.dom.ownerDocument.defaultView ?? window;

	const pluginState = columnResizingPluginKey.getState(view.state);
	if (!pluginState || pluginState.activeHandle == -1 || pluginState.dragging) return false;

	const cell = view.state.doc.nodeAt(pluginState.activeHandle)!;
	const width = currentColWidth(view, pluginState.activeHandle, cell.attrs);
	// TEXPILE: in splitter mode the neighbour is half the gesture, so its starting width is part of
	// the drag state - measured now, before the drag begins changing it
	const neighbour = redistribute ? neighbourColumn(view, pluginState.activeHandle) : null;
	view.dispatch(
		view.state.tr.setMeta(columnResizingPluginKey, {
			setDragging: {
				startX: event.clientX,
				startWidth: width,
				...(neighbour ? { neighbourCol: neighbour.col, neighbourStartWidth: neighbour.width } : {})
			}
		})
	);

	// TEXPILE: measured once at mousedown rather than per move - the table's own width does not
	// change during a drag, and re-measuring mid-drag would read the width the drag is producing
	const ctx = snap ? snapContext(view, pluginState.activeHandle) : null;
	function quantise(raw: number) {
		return snap && ctx ? snap(raw, ctx) : raw;
	}
	const minWidth = ctx && snap ? snap(0, ctx) : cellMinWidth;

	/**
	 * TEXPILE: the pair of widths a splitter drag produces. The dragged column is quantised first,
	 * then the neighbour takes exactly the negation of the change, so the total is constant by
	 * construction rather than by clamping. Both are floored at one step; hitting either floor stops
	 * the gesture rather than letting the other column keep moving.
	 */
	function widths(dragging: Dragging, event: MouseEvent): Map<number, number> | null {
		if (dragging.neighbourCol == null || dragging.neighbourStartWidth == null) return null;
		const pair = dragging.neighbourStartWidth + dragging.startWidth;
		let next = quantise(draggedWidth(dragging, event, cellMinWidth));
		next = Math.max(minWidth, Math.min(next, pair - minWidth));
		return new Map([
			[columnOf(view, pluginState!.activeHandle), next],
			[dragging.neighbourCol, pair - next]
		]);
	}

	function finish(event: MouseEvent) {
		win.removeEventListener('mouseup', finish);
		win.removeEventListener('mousemove', move);
		const pluginState = columnResizingPluginKey.getState(view.state);
		if (pluginState?.dragging) {
			// TEXPILE: a click on the border that never moved leaves the table's widths as its file has them
			if (event.clientX !== pluginState.dragging.startX) {
				// TEXPILE: commit the SNAPPED width(s), so nothing shifts on release
				const pair = widths(pluginState.dragging, event);
				if (pair) updateColumnWidths(view, pluginState.activeHandle, pair);
				else updateColumnWidth(view, pluginState.activeHandle, quantise(draggedWidth(pluginState.dragging, event, cellMinWidth)));
			}
			view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null }));
		}
	}

	function move(event: MouseEvent): void {
		if (!event.which) return finish(event);
		const pluginState = columnResizingPluginKey.getState(view.state);
		if (!pluginState) return;
		if (pluginState.dragging) {
			// TEXPILE: the preview is quantised too - that is what makes the drag feel notched
			const pair = widths(pluginState.dragging, event);
			if (pair) displayColumnWidths(view, pluginState.activeHandle, pair, defaultCellMinWidth);
			else
				displayColumnWidth(
					view,
					pluginState.activeHandle,
					quantise(draggedWidth(pluginState.dragging, event, cellMinWidth)),
					defaultCellMinWidth
				);
		}
	}

	win.addEventListener('mouseup', finish);
	win.addEventListener('mousemove', move);
	event.preventDefault();
	return true;
}

function currentColWidth(view: EditorView, cellPos: number, { colspan, colwidth }: Attrs): number {
	const width = colwidth && colwidth[colwidth.length - 1];
	if (width) return width;
	const dom = view.domAtPos(cellPos);
	const node = dom.node.childNodes[dom.offset] as HTMLElement;
	let domWidth = node.offsetWidth,
		parts = colspan;
	if (colwidth)
		for (let i = 0; i < colspan; i++)
			if (colwidth[i]) {
				domWidth -= colwidth[i];
				parts--;
			}
	return domWidth / parts;
}

function domCellAround(start: HTMLElement | null): HTMLElement | null {
	let target = start;
	while (target && target.nodeName != 'TD' && target.nodeName != 'TH')
		target = target.classList && target.classList.contains('ProseMirror') ? null : (target.parentNode as HTMLElement);
	return target;
}

function edgeCell(view: EditorView, event: MouseEvent, side: 'left' | 'right', handleWidth: number): number {
	// posAtCoords returns inconsistent positions when cursor is moving across a collapsed table
	// border. Use an offset to adjust the target viewport coordinates away from the table border.
	const offset = side == 'right' ? -handleWidth : handleWidth;
	const found = view.posAtCoords({ left: event.clientX + offset, top: event.clientY });
	if (!found) return -1;
	const { pos } = found;
	const $cell = cellAround(view.state.doc.resolve(pos));
	if (!$cell) return -1;
	if (side == 'right') return $cell.pos;
	const map = TableMap.get($cell.node(-1)),
		start = $cell.start(-1);
	const index = map.map.indexOf($cell.pos - start);
	return index % map.width == 0 ? -1 : start + map.map[index - 1];
}

function draggedWidth(dragging: Dragging, event: MouseEvent, resizeMinWidth: number): number {
	const offset = event.clientX - dragging.startX;
	return Math.max(resizeMinWidth, dragging.startWidth + offset);
}

function updateHandle(view: EditorView, value: number): void {
	view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setHandle: value }));
}

function updateColumnWidth(view: EditorView, cell: number, width: number): void {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1),
		map = TableMap.get(table),
		start = $cell.start(-1);
	const col = map.colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1;
	const tr = view.state.tr;
	for (let row = 0; row < map.height; row++) {
		const mapIndex = row * map.width + col;
		// Rowspanning cell that has already been handled
		if (row && map.map[mapIndex] == map.map[mapIndex - map.width]) continue;
		const pos = map.map[mapIndex];
		const attrs = table.nodeAt(pos)!.attrs as CellAttrs;
		const index = attrs.colspan == 1 ? 0 : col - map.colCount(pos);
		if (attrs.colwidth && attrs.colwidth[index] == width) continue;
		const colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan);
		colwidth[index] = width;
		tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth: colwidth });
	}
	if (tr.docChanged) view.dispatch(tr);
}

function displayColumnWidth(view: EditorView, cell: number, width: number, defaultCellMinWidth: number): void {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1),
		start = $cell.start(-1);
	const col = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1;
	let dom: Node | null = view.domAtPos($cell.start(-1)).node;
	while (dom && dom.nodeName != 'TABLE') dom = dom.parentNode;
	if (!dom) return;
	updateColumnsOnResize(table, dom.firstChild as HTMLTableColElement, dom as HTMLTableElement, defaultCellMinWidth, col, width);
}

function zeroes(n: number): 0[] {
	return Array(n).fill(0);
}

/**
 * TEXPILE: updateColumnWidth for several columns in ONE transaction. Two separate calls would
 * dispatch twice, and the second would be computed against a document the first already changed.
 */
function updateColumnWidths(view: EditorView, cell: number, byColumn: Map<number, number>): void {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1),
		map = TableMap.get(table),
		start = $cell.start(-1);
	const tr = view.state.tr;
	for (const [col, width] of byColumn) {
		for (let row = 0; row < map.height; row++) {
			const mapIndex = row * map.width + col;
			// Rowspanning cell that has already been handled
			if (row && map.map[mapIndex] == map.map[mapIndex - map.width]) continue;
			const pos = map.map[mapIndex];
			// attrs come off the TRANSACTION's doc: an earlier column in this loop may already have
			// rewritten this same cell when it spans both
			const attrs = tr.doc.nodeAt(start + pos)!.attrs as CellAttrs;
			const index = attrs.colspan == 1 ? 0 : col - map.colCount(pos);
			if (attrs.colwidth && attrs.colwidth[index] == width) continue;
			const colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan);
			colwidth[index] = width;
			tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
		}
	}
	if (tr.docChanged) view.dispatch(tr);
}

/** TEXPILE: displayColumnWidth for several columns - updateColumnsOnResize only overrides one. */
function displayColumnWidths(view: EditorView, cell: number, byColumn: Map<number, number>, defaultCellMinWidth: number): void {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.node(-1);
	let dom: Node | null = view.domAtPos($cell.start(-1)).node;
	while (dom && dom.nodeName != 'TABLE') dom = dom.parentNode;
	if (!dom) return;
	const colgroup = (dom as HTMLTableElement).firstChild as HTMLTableColElement | null;
	const row = table.firstChild;
	if (!colgroup || !row) return;

	// same walk as updateColumnsOnResize, with a map of overrides instead of a single one
	let totalWidth = 0;
	let fixedWidth = true;
	let nextDom = colgroup.firstChild as HTMLElement | null;
	for (let i = 0, col = 0; i < row.childCount; i++) {
		const { colspan, colwidth } = row.child(i).attrs;
		for (let j = 0; j < colspan; j++, col++) {
			const override = byColumn.get(col);
			const hasWidth = override != null ? override : colwidth && colwidth[j];
			const cssWidth = hasWidth ? hasWidth + 'px' : '';
			totalWidth += hasWidth || defaultCellMinWidth;
			if (!hasWidth) fixedWidth = false;
			if (!nextDom) {
				const added = document.createElement('col');
				added.style.width = cssWidth;
				colgroup.appendChild(added);
			} else {
				if (nextDom.style.width != cssWidth) nextDom.style.width = cssWidth;
				nextDom = nextDom.nextSibling as HTMLElement | null;
			}
		}
	}
	while (nextDom) {
		const after = nextDom.nextSibling as HTMLElement | null;
		nextDom.parentNode?.removeChild(nextDom);
		nextDom = after;
	}
	const el = dom as HTMLTableElement;
	if (fixedWidth) {
		el.style.width = totalWidth + 'px';
		el.style.minWidth = '';
	} else {
		el.style.width = '';
		el.style.minWidth = totalWidth + 'px';
	}
}

export function handleDecorations(state: EditorState, cell: number): DecorationSet {
	const decorations = [];
	const $cell = state.doc.resolve(cell);
	const table = $cell.node(-1);
	if (!table) return DecorationSet.empty;
	const map = TableMap.get(table);
	const start = $cell.start(-1);
	const col = map.colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1;
	for (let row = 0; row < map.height; row++) {
		const index = col + row * map.width;
		// For positions that have either a different cell or the end of the table to their right,
		// and either the top of the table or a different cell above them, add a decoration
		if ((col == map.width - 1 || map.map[index] != map.map[index + 1]) && (row == 0 || map.map[index] != map.map[index - map.width])) {
			const cellPos = map.map[index];
			const pos = start + cellPos + table.nodeAt(cellPos)!.nodeSize - 1;
			const dom = document.createElement('div');
			dom.className = 'column-resize-handle';
			if (columnResizingPluginKey.getState(state)?.dragging) {
				decorations.push(
					Decoration.node(start + cellPos, start + cellPos + table.nodeAt(cellPos)!.nodeSize, { class: 'column-resize-dragging' })
				);
			}
			decorations.push(Decoration.widget(pos, dom));
		}
	}
	return DecorationSet.create(state.doc, decorations);
}
