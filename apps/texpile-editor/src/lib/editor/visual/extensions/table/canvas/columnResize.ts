// Typst column resizing on the table layout (15.1), as P0's vendored columnResizing ran it: the border under the pointer, a
// drag that trades width with the next column at quarter-fr steps, and colwidth on release
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { cellAround, pointsAtCell, TableMap } from 'prosemirror-tables';
import type { FaceInputKey, VisualView } from '$lib/editor/canvas';
import { windowInvalidation } from '$lib/editor/canvas';
import { snapWidthToFr } from '../snapWidth';

type ColumnDrag = { table: number };

export type ColumnResizeState = {
	/** the cell position whose right edge is under the pointer, or -1 */
	readonly activeHandle: number;
	readonly dragging: ColumnDrag | null;
	/** widths the table layout draws while a drag runs, by table position */
	readonly displayWidths: ReadonlyMap<number, ReadonlyMap<number, number>>;
};

export const columnResizeKey = new PluginKey<ColumnResizeState>('canvasColumnResize');
export const COLUMN_RESIZE_KEY: FaceInputKey = { kind: 'overlay', key: 'column-resize' };

const IDLE: ColumnResizeState = { activeHandle: -1, dragging: null, displayWidths: new Map() };
const HANDLE_WIDTH = 5;

function canvasOf(view: EditorView): VisualView {
	return view as unknown as VisualView;
}

function columnOf(state: EditorState, cell: number): number {
	const $cell = state.doc.resolve(cell);
	const map = TableMap.get($cell.node(-1));
	return map.colCount($cell.pos - $cell.start(-1)) + $cell.nodeAfter!.attrs.colspan - 1;
}

function cellRect(view: EditorView, cell: number): DOMRect | null {
	const rect = canvasOf(view).canvas.geometry.nodeRect(cell)?.rect;
	return rect ? canvasOf(view).canvas.clientRect(rect) : null;
}

/** the cell whose right border is within reach of the pointer; the last column's is the table's edge */
function handleAt(view: EditorView, event: MouseEvent): number {
	const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
	const $cell = found && cellAround(view.state.doc.resolve(found.pos));
	if (!$cell) return -1;
	const rect = cellRect(view, $cell.pos);
	if (!rect) return -1;
	const map = TableMap.get($cell.node(-1));
	const start = $cell.start(-1);
	let cell = -1;
	if (rect.right - event.clientX <= HANDLE_WIDTH) cell = $cell.pos;
	else if (event.clientX - rect.left <= HANDLE_WIDTH) {
		const index = map.map.indexOf($cell.pos - start);
		cell = index % map.width === 0 ? -1 : start + map.map[index - 1];
	}
	return cell >= 0 && columnOf(view.state, cell) < map.width - 1 ? cell : -1;
}

function withState(view: EditorView, next: Partial<ColumnResizeState>): void {
	const state = columnResizeKey.getState(view.state) ?? IDLE;
	view.dispatch(view.state.tr.setMeta(columnResizeKey, { ...state, ...next }));
}

/** the width of every column in the table, as drawn */
function drawnWidths(view: EditorView, table: number): number[] {
	const node = view.state.doc.nodeAt(table)!;
	const map = TableMap.get(node);
	return Array.from({ length: map.width }, (_, col) => cellRect(view, table + 1 + map.map[col])?.width ?? 0);
}

/** the dragged column and its neighbour after a drag of `dx`: the pair keeps its sum, each at least one step */
export function tradedWidths(start: [number, number], dx: number, snap: (raw: number) => number): [number, number] {
	const pair = start[0] + start[1];
	const least = snap(0);
	const next = Math.max(least, Math.min(snap(Math.max(0, start[0] + dx)), pair - least));
	return [next, pair - next];
}

function writeWidths(view: EditorView, table: number, widths: ReadonlyMap<number, number>): void {
	const node = view.state.doc.nodeAt(table);
	if (!node) return;
	const map = TableMap.get(node);
	const tr = view.state.tr;
	for (const [col, width] of widths) {
		for (let row = 0; row < map.height; row++) {
			const index = row * map.width + col;
			if (row && map.map[index] === map.map[index - map.width]) continue;
			const pos = table + 1 + map.map[index];
			const attrs = tr.doc.nodeAt(pos)!.attrs as { colspan: number; colwidth: number[] | null };
			const at = attrs.colspan === 1 ? 0 : col - map.colCount(map.map[index]);
			if (attrs.colwidth?.[at] === width) continue;
			const colwidth = attrs.colwidth ? attrs.colwidth.slice() : Array<number>(attrs.colspan).fill(0);
			colwidth[at] = width;
			tr.setNodeMarkup(pos, undefined, { ...attrs, colwidth });
		}
	}
	if (tr.docChanged) view.dispatch(tr);
}

/** a press on the border of the cell at `cell`: the drag follows the pointer until it lets go */
export function startColumnDrag(view: EditorView, cell: number, event: MouseEvent): void {
	const $cell = view.state.doc.resolve(cell);
	const table = $cell.before(-1);
	const col = columnOf(view.state, cell);
	const widths = drawnWidths(view, table);
	const tableWidth = widths.reduce((sum, width) => sum + width, 0);
	function snap(raw: number): number {
		return snapWidthToFr(raw, { tableWidth, columns: widths.length });
	}
	const start: [number, number] = [widths[col], widths[col + 1]];
	const doc = view.dom.ownerDocument;
	function traded(at: MouseEvent): Map<number, number> {
		const [left, right] = tradedWidths(start, at.clientX - event.clientX, snap);
		return new Map([
			[col, left],
			[col + 1, right]
		]);
	}
	function move(at: MouseEvent): void {
		withState(view, { displayWidths: new Map([[table, traded(at)]]) });
	}
	function release(at: MouseEvent): void {
		doc.removeEventListener('mousemove', move);
		withState(view, { dragging: null, displayWidths: new Map() });
		// a click on the border that never moved leaves the widths as the file has them
		if (at.clientX !== event.clientX) writeWidths(view, table, traded(at));
	}
	withState(view, { dragging: { table } });
	doc.addEventListener('mousemove', move);
	doc.addEventListener('mouseup', release, { once: true });
}

export function columnResize(): Plugin<ColumnResizeState> {
	return new Plugin<ColumnResizeState>({
		key: columnResizeKey,
		state: {
			init: () => IDLE,
			apply(tr: Transaction, value) {
				const next = tr.getMeta(columnResizeKey) as ColumnResizeState | undefined;
				if (next) return next;
				if (value.activeHandle < 0 || !tr.docChanged) return value;
				const handle = tr.mapping.map(value.activeHandle, -1);
				return { ...value, activeHandle: pointsAtCell(tr.doc.resolve(handle)) ? handle : -1 };
			}
		},
		props: {
			handleDOMEvents: {
				mousemove(view, event) {
					const state = columnResizeKey.getState(view.state);
					if (!view.editable || !state || state.dragging || event.buttons) return false;
					const cell = handleAt(view, event);
					if (cell !== state.activeHandle) withState(view, { activeHandle: cell });
					return false;
				}
			}
		},
		view: () => ({
			update(view, prev) {
				const before = columnResizeKey.getState(prev);
				const now = columnResizeKey.getState(view.state);
				if (before?.displayWidths !== now?.displayWidths) windowInvalidation(view.dom.ownerDocument.defaultView!).fire(COLUMN_RESIZE_KEY);
			}
		})
	});
}
