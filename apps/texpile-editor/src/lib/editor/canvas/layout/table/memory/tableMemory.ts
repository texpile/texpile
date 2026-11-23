// a table block's rows and cells carried from one layout to the next: a row whose node, elements and style are the same
// comes back with its cells laid out, moved to where it now stands; a cell whose width or borders moved is built again
import type { Node as PMNode } from 'prosemirror-model';
import type { LayoutBoxBuilder } from '../../../contracts/layoutTypes';
import type { ComputedStyle, Edges } from '../../../contracts/styleTypes';
import { FaceElement } from '../../../tree/faceElement';
import type { RowSource } from '../../boxTree';
import { movedBoxes, movedLines } from './cellMove';
import { shapeOf, widenedChildren } from './cellShape';
import type { CellRecord, LaidCell, MeasuredCell, RowMemory, RowRecord } from './rowMemory';

export type TableMemoryHost = {
	/** the block's position, which a decoration's range is counted from */
	readonly pos: number;
	/** a decoration stands in the document range */
	decorated(from: number, to: number): boolean;
	/** the line breaking holds these paragraphs, or the word or preedit being typed is in the range */
	typing(from: number, to: number, textblocks: readonly PMNode[]): boolean;
	/** the paragraphs this layout broke for itself alone */
	readonly transient: ReadonlySet<PMNode>;
	remake(box: LayoutBoxBuilder, style: ComputedStyle): void;
};

/** a row of an earlier layout that this one took, and whether a cell of it changed since */
type ReusedRow = { readonly record: RowRecord; readonly delta: number; dirty: boolean };

/** a cell of an earlier layout and what is left to do for it in this one */
type CellState = {
	record: CellRecord | null;
	row: ReusedRow | null;
	/** how far its offsets moved since the record */
	delta: number;
	/** its content is in the box */
	ready: boolean;
	measured: MeasuredCell | null;
	laid: LaidCell | null;
};

function sameEdges(a: Edges<number>, b: Edges<number>): boolean {
	return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function textblocksOf(box: LayoutBoxBuilder, into: PMNode[] = []): PMNode[] {
	if (box.lines && box.node) into.push(box.node.node);
	for (const child of box.children) textblocksOf(child, into);
	return into;
}

function elementsOf(element: FaceElement, into: FaceElement[] = []): FaceElement[] {
	into.push(element);
	for (const child of element.childNodes) if (child instanceof FaceElement) elementsOf(child, into);
	return into;
}

function template(box: LayoutBoxBuilder): LayoutBoxBuilder {
	return { ...box, children: [], lines: null, baselines: null };
}

export class TableMemory implements RowSource {
	/** the rows of this layout, for the next */
	readonly rows: RowMemory = new Map();
	private readonly cells = new WeakMap<LayoutBoxBuilder, CellState>();
	private readonly reused = new WeakMap<LayoutBoxBuilder, ReusedRow>();

	constructor(
		private readonly earlier: RowMemory | null,
		private readonly host: TableMemoryHost
	) {}

	reuse(element: FaceElement, style: ComputedStyle, node: PMNode, offset: number): LayoutBoxBuilder | null {
		const record = this.earlier?.get(node);
		if (!record || record.element !== element || record.style !== style) return null;
		const from = this.host.pos + offset;
		const to = from + node.nodeSize;
		if (this.host.decorated(from, to)) return null;
		if (this.host.typing(from, to, record.textblocks)) return null;
		const { elements, versions } = record;
		for (let i = 0; i < elements.length; i++) if (elements[i].version !== versions[i]) return null;
		const delta = offset - record.offset;
		const reused: ReusedRow = { record, delta, dirty: false };
		const row: LayoutBoxBuilder = {
			...record.box,
			margin: { ...record.box.margin },
			node: { node, offset },
			children: record.cells.map((cell) => this.kept(cell, delta, reused))
		};
		this.reused.set(row, reused);
		return row;
	}

	private kept(record: CellRecord, delta: number, row: ReusedRow): LayoutBoxBuilder {
		const { box } = record;
		const cell: LayoutBoxBuilder = {
			...box,
			margin: { ...box.margin },
			node: box.node && { node: box.node.node, offset: box.node.offset + delta }
		};
		this.cells.set(cell, { record, row, delta, ready: false, measured: record.measured, laid: record.laid });
		return cell;
	}

	/** the widths a kept cell was measured at, when its borders are the same; else it is built again */
	measuredOf(box: LayoutBoxBuilder): { min: number; max: number } | null {
		const state = this.cells.get(box);
		if (!state?.record) return null;
		const { measured } = state;
		if (measured && sameEdges(box.style.layout.borderWidth, measured.borders)) return measured;
		this.rebuild(box, state);
		return null;
	}

	measure(box: LayoutBoxBuilder, widths: { min: number; max: number }): void {
		const state = this.cells.get(box) ?? this.fresh(box);
		state.measured = { borders: { ...box.style.layout.borderWidth }, min: widths.min, max: widths.max };
	}

	/** a kept cell takes its content at this width when its lines stay as they were; else it is built again */
	settle(box: LayoutBoxBuilder, width: number): boolean {
		const state = this.cells.get(box);
		if (!state?.record) return false;
		const { laid } = state;
		if (!laid || !sameEdges(box.style.layout.borderWidth, laid.borders)) return this.rebuild(box, state);
		if (state.ready) return laid.width === width || this.rebuild(box, state);
		const { record, delta } = state;
		const grown = width - laid.width;
		if (grown && (record.minWidth === null || width < record.minWidth)) return this.rebuild(box, state);
		const children = grown ? widenedChildren(laid.children, grown) : laid.children;
		const moved = delta !== 0 || grown !== 0;
		const lines = laid.lines && (delta ? movedLines(laid.lines, delta) : laid.lines);
		Object.assign(box, {
			width,
			height: laid.height,
			baselines: laid.baselines,
			lines,
			children: delta ? movedBoxes(children, delta) : children.slice()
		});
		Object.assign(state, { ready: true, laid: moved ? { ...laid, width, children: box.children.slice(), lines } : laid });
		if (grown) state.row!.dirty = true;
		return true;
	}

	private rebuild(box: LayoutBoxBuilder, state: CellState): false {
		this.host.remake(box, state.record!.style);
		const { row } = state;
		row!.dirty = true;
		Object.assign(state, { record: null, laid: null });
		return false;
	}

	private fresh(box: LayoutBoxBuilder): CellState {
		const state: CellState = { record: null, row: null, delta: 0, ready: false, measured: null, laid: null };
		this.cells.set(box, state);
		return state;
	}

	/** a cell laid out in this layout */
	laidOut(box: LayoutBoxBuilder, width: number): void {
		const state = this.cells.get(box) ?? this.fresh(box);
		state.laid = {
			width,
			borders: { ...box.style.layout.borderWidth },
			height: box.height,
			baselines: box.baselines,
			children: box.children.slice(),
			lines: box.lines
		};
	}

	/** once the table is laid out: its rows are kept for the next layout */
	keep(table: LayoutBoxBuilder): void {
		for (const child of table.children) {
			if (child.kind === 'row') this.keepRow(child);
			else for (const row of child.children) if (row.kind === 'row') this.keepRow(row);
		}
	}

	private keepRow(row: LayoutBoxBuilder): void {
		const { node, element } = row;
		if (!node || !element) return;
		const earlier = this.reused.get(row);
		if (earlier && earlier.delta === 0 && !earlier.dirty) return void this.rows.set(node.node, earlier.record);
		const from = this.host.pos + node.offset;
		if (this.host.decorated(from, from + node.node.nodeSize)) return;
		const cells: CellRecord[] = [];
		for (const cell of row.children) {
			const made = this.recordOf(cell);
			if (!made) return;
			cells.push(made);
		}
		if (cells.some((cell) => cell.textblocks.some((textblock) => this.host.transient.has(textblock)))) return;
		const elements = elementsOf(element);
		this.rows.set(node.node, {
			element,
			style: row.style,
			offset: node.offset,
			box: template(row),
			cells,
			textblocks: cells.flatMap((cell) => cell.textblocks),
			elements,
			versions: elements.map((each) => each.version)
		});
	}

	private recordOf(cell: LayoutBoxBuilder): CellRecord | null {
		const state = this.cells.get(cell);
		if (!cell.element || !cell.node || !state?.laid || (state.record && !state.ready)) return null;
		const { record } = state;
		if (record && state.laid === record.laid) return record;
		const shape = record ? { minWidth: record.minWidth } : shapeOf(cell);
		if (!shape) return null;
		return {
			box: template(cell),
			element: cell.element,
			style: cell.style,
			measured: state.measured,
			laid: state.laid,
			minWidth: shape.minWidth,
			textblocks: record?.textblocks ?? textblocksOf(cell)
		};
	}
}
