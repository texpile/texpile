// where a caret place sits: its textblock and line by affinity, and its rect in the font at the place (7.2, 7.3)
import type { CaretPlace } from '../contracts/geometryTypes';
import type { DocRect, LineFragment, TextMeasure } from '../contracts/layoutTypes';
import type { DocumentModel } from '../contracts/engineTypes';
import { runBaselineOffset } from '../layout/inline/lineBoxes';
import type { FontMetricsReader } from '../layout/text/fontMetrics';
import { blockOnModel, linesHolding, textblockHolding, type BlockOnModel, type PlacedTextblock } from './lineIndex';
import { fragmentAt, lineX, type FragmentSide } from './positionMap';

export type GeometryTools = { readonly measure: TextMeasure; readonly metrics: FontMetricsReader };

/** a caret place resolved: the line it is drawn on and its offset from the block's start */
export type CaretSpot = {
	readonly block: BlockOnModel;
	readonly textblock: PlacedTextblock;
	readonly index: number;
	readonly offset: number;
};

function nearestLine(textblock: PlacedTextblock, offset: number): number {
	let index = 0;
	textblock.lines.forEach((line, i) => {
		if (line.from <= offset) index = i;
	});
	return index;
}

/** null for a position outside every textblock (between blocks, inside a drawn block); layOut false reads the layout a block last had */
export function caretSpotOf(model: DocumentModel, place: CaretPlace, layOut = true): CaretSpot | null {
	if (!model.count) return null;
	const block = blockOnModel(model, model.indexAt(place.pos), layOut);
	if (!block) return null;
	const offset = place.pos - block.frame.pos;
	const textblock = textblockHolding(block.placement, offset);
	if (!textblock) return null;
	const lines = linesHolding(textblock, offset);
	const index = lines.length ? (place.affinity < 0 ? lines[0] : lines[lines.length - 1]) : nearestLine(textblock, offset);
	return { block, textblock, index, offset };
}

/** the caret at the spot, 0 wide: the text's font box at the place, an atom's border box beside one, else the strut */
export function caretRectAt(spot: CaretSpot, tools: GeometryTools, side: FragmentSide): DocRect {
	const { block, textblock, index, offset } = spot;
	const line = textblock.lines[index];
	const x = textblock.x + lineX(textblock, index, offset, side, { top: block.node, measure: tools.measure });
	const top = block.frame.top + textblock.y;
	const fragment: LineFragment | null = fragmentAt(line, offset, side);
	if (fragment?.kind === 'atomic') return { x, y: top + fragment.box.y, width: 0, height: fragment.box.height };
	if (fragment?.kind === 'text') {
		const metrics = tools.metrics(fragment.run.fontString);
		const baseline = line.baseline + runBaselineOffset(fragment.run, textblock.box.style.layout, tools.metrics);
		return { x, y: top + baseline - metrics.ascent, width: 0, height: metrics.ascent + metrics.descent };
	}
	return { x, y: top + line.textTop, width: 0, height: line.textBottom - line.textTop };
}
