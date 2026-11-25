// a block laid out again as the view does after an edit: unchanged nodes keep their elements and the last layout is passed on
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, CanvasStyles, FaceElement, LayoutBox, PositionMap } from '$lib/editor/canvas';
import { collapsedBordersOf } from '$lib/editor/canvas/layout/table/tableBorders';
import { tableColumnWidths } from '$lib/editor/canvas/layout/table/tableLayout';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { fixedStyles } from '../testing/fixedStyles';
import { layoutTestBlock, testBlockElements, type KeptElement, type TestLayoutOptions } from './layoutFixture';

/** a box tree as its geometry, offsets and lines, which two layouts of one document must agree on */
export function shapeOf(box: LayoutBox): unknown {
	return {
		kind: box.kind,
		box: [box.x, box.y, box.width, box.height],
		node: box.node?.offset ?? null,
		baselines: box.baselines,
		lines: box.lines?.map((line) => [
			line.y,
			line.height,
			line.baseline,
			line.from,
			line.to,
			line.fragments.map((fragment) => [
				fragment.kind,
				fragment.x,
				fragment.width,
				'text' in fragment ? fragment.text : '',
				fragment.kind === 'atomic' ? shapeOf(fragment.box) : null
			])
		]),
		columns: box.kind === 'table' ? tableColumnWidths(box) : null,
		borders: box.kind === 'table' ? collapsedBordersOf(box).map(({ rect, side, width }) => [rect, side, width]) : null,
		children: box.children.map(shapeOf)
	};
}

/** `built` counts the elements the layout read the position of: one for each box it made from the element tree */
export type Laid = { layout: BlockLayout; built: number };

function counted(elements: { root: FaceElement; positions: PositionMap }): { elements: typeof elements; built: () => number } {
	let built = 0;
	const { positions } = elements;
	const counting: PositionMap = {
		posOf: (element) => (built++, positions.posOf(element)),
		elementAt: (offset) => positions.elementAt(offset),
		contentStart: (element) => positions.contentStart(element)
	};
	return { elements: { root: elements.root, positions: counting }, built: () => built };
}

export class WarmBlock {
	private readonly kept = new Map<PMNode, KeptElement>();
	private readonly styles: CanvasStyles;
	private last: BlockLayout | null = null;

	constructor(private readonly rules: readonly FixedStyleRule[]) {
		this.styles = fixedStyles(rules);
	}

	lay(doc: PMNode, options: TestLayoutOptions = {}): Laid {
		const { elements, built } = counted(testBlockElements(doc, this.kept));
		const layout = layoutTestBlock(doc, { ...options, styles: this.styles, elements, previous: this.last });
		this.last = layout;
		return { layout, built: built() };
	}

	/** the document laid out from nothing, under the same rules */
	cold(doc: PMNode, options: TestLayoutOptions = {}): Laid {
		const { elements, built } = counted(testBlockElements(doc));
		return { layout: layoutTestBlock(doc, { rules: this.rules, ...options, elements }), built: built() };
	}
}
