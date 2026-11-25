// the rows of a table block as its last layout left them, kept by row node for the next layout (0.5, 5.6)
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, LayoutBoxBuilder, LineBox } from '../../../contracts/layoutTypes';
import type { ComputedStyle, Edges } from '../../../contracts/styleTypes';
import type { FaceElement } from '../../../tree/faceElement';

/** a cell's min-content and max-content widths under the borders it was measured with */
export type MeasuredCell = { readonly borders: Edges<number>; readonly min: number; readonly max: number };

/** a cell as it stood laid out, before its row placed its content */
export type LaidCell = {
	readonly width: number;
	readonly borders: Edges<number>;
	readonly height: number;
	readonly baselines: LayoutBoxBuilder['baselines'];
	readonly children: readonly LayoutBoxBuilder[];
	readonly lines: LineBox[] | null;
};

export type CellRecord = {
	/** the cell's fields without its content */
	readonly box: LayoutBoxBuilder;
	readonly element: FaceElement;
	readonly style: ComputedStyle;
	readonly measured: MeasuredCell | null;
	readonly laid: LaidCell;
	/** the narrowest width the lines stay as they are at; null when only the width it was laid out at keeps them */
	readonly minWidth: number | null;
	readonly textblocks: readonly PMNode[];
};

export type RowRecord = {
	readonly element: FaceElement;
	readonly style: ComputedStyle;
	/** where the cells' lines and boxes stand from the block's start */
	readonly offset: number;
	readonly box: LayoutBoxBuilder;
	readonly cells: readonly CellRecord[];
	/** the paragraphs of its cells */
	readonly textblocks: readonly PMNode[];
	/** the row's elements and their versions, which no later change may have moved */
	readonly elements: readonly FaceElement[];
	readonly versions: readonly number[];
};

export type RowMemory = Map<PMNode, RowRecord>;

const memories = new WeakMap<BlockLayout, { readonly breaking: string; readonly rows: RowMemory }>();

/** the rows a layout kept, when its lines were broken under the same justification, patterns and pixel ratio */
export function rowsOf(layout: BlockLayout | null | undefined, breaking: string): RowMemory | null {
	const kept = layout && memories.get(layout);
	return kept && kept.breaking === breaking ? kept.rows : null;
}

export function keepRows(layout: BlockLayout, breaking: string, rows: RowMemory): void {
	if (rows.size) memories.set(layout, { breaking, rows });
}
