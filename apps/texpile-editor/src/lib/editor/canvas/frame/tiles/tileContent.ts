// what a row of tiles shows, as data: a frame repaints the doc bands whose blocks, tints, selection or preedit changed
import type { Node as PMNode } from 'prosemirror-model';
import type { InlineDecorationView } from '../../contracts/decorationTypes';
import type { PaintFrame, PlacedBlock } from '../../contracts/engineTypes';
import type { BlockLayout, DocRect } from '../../contracts/layoutTypes';
import { heldPassageShown } from '../../paint/paintInline';
import { shadedRange } from '../../paint/paintSelection';

/** a tint, the selection shade or the preedit over a block, in offsets from the block's start */
export type MarkSpan = { readonly from: number; readonly to: number; readonly look: string };

/** one block as a row drew it */
export type BlockPaint = {
	readonly node: PMNode;
	readonly layout: BlockLayout;
	readonly top: number;
	readonly marks: readonly MarkSpan[];
};

export type TileContent = {
	/** what every block shares: the painter's epoch and ground, the root sheet, the scale, the pane's columns */
	readonly scene: string;
	readonly blocks: readonly BlockPaint[];
};

export type DocBand = { readonly from: number; readonly to: number };

/** the y bands, in the block's space, where a block draws differently than before; null when it cannot say */
export type InkChanges = (before: BlockPaint, after: BlockPaint) => readonly DocBand[] | null;

/** doc px a block's ink may reach past its box: outlines, glyphs over the line box */
export const INK_OVERFLOW = 16;
/** a repaint that would cover more of the row than this repaints the whole row */
const WHOLE_ROW_SHARE = 0.6;

/** the frame's part every block of a row shares; the root sheet's height counts only where the sheet paints */
export function sceneOf(frame: PaintFrame, painterKey: string): string {
	const { viewport, zoom, dpr, root } = frame;
	const held = frame.focus !== 'editor' && heldPassageShown(frame.decorations.inline);
	let sheet = '';
	if (root) {
		const { rect, style } = root;
		const { paint } = style;
		const { top, right, bottom, left } = style.layout.borderWidth;
		const paints = paint.backgroundColor.a > 0 || paint.boxShadow.length > 0 || top + right + bottom + left > 0;
		sheet = `${rect.x}:${rect.y}:${rect.width}:${paints ? rect.height : ''}`;
	}
	return `${painterKey}|${dpr}|${zoom}|${viewport.x}|${viewport.width}|${sheet}|${held}`;
}

function decorationMarks(inline: readonly InlineDecorationView[], pos: number, end: number, into: MarkSpan[]): void {
	for (const decoration of inline)
		if (decoration.from < end && decoration.to > pos)
			into.push({
				from: decoration.from - pos,
				to: decoration.to - pos,
				look: `${decoration.classes.join(' ')}|${decoration.style}|${JSON.stringify(decoration.attrs)}`
			});
}

/** the blocks of a frame with what they draw beside their layout */
export function blockPaintsOf(
	blocks: readonly PlacedBlock[],
	frame: PaintFrame,
	nodeOf: (index: number) => PMNode,
	sessionKey?: (block: PlacedBlock) => string
): BlockPaint[] {
	const range = shadedRange(frame.state.selection);
	const { composition } = frame;
	return blocks.map((block) => {
		const node = nodeOf(block.index);
		const { pos } = block;
		const end = pos + node.nodeSize;
		const marks: MarkSpan[] = [];
		decorationMarks(frame.decorations.inline, pos, end, marks);
		// a shade running past the block's end extends its last line by a space
		if (range && range.from < end && range.to > pos)
			marks.push({ from: Math.max(-1, range.from - pos), to: Math.min(node.nodeSize + 1, range.to - pos), look: 'selection' });
		if (composition && composition.from <= end && composition.to >= pos)
			marks.push({
				from: composition.from - pos,
				to: composition.to - pos,
				look: `preedit${JSON.stringify(composition.formats.map((f) => [f.from - composition.from, f.to - composition.from, f.thickness]))}`
			});
		const session = sessionKey?.(block);
		if (session) marks.push({ from: 0, to: 0, look: `session${session}` });
		return { node, layout: block.layout, top: block.top, marks };
	});
}

/** whether a block's ink may reach into the doc band [top, bottom) */
export function reaches(block: { top: number; layout: BlockLayout }, top: number, bottom: number): boolean {
	return block.top - INK_OVERFLOW < bottom && block.top + block.layout.height + INK_OVERFLOW > top;
}

export function blocksOver<T extends { top: number; layout: BlockLayout }>(blocks: readonly T[], top: number, bottom: number): T[] {
	return blocks.filter((block) => reaches(block, top, bottom));
}

function sameMarks(a: readonly MarkSpan[], b: readonly MarkSpan[]): boolean {
	return a.length === b.length && a.every((mark, i) => mark.from === b[i].from && mark.to === b[i].to && mark.look === b[i].look);
}

/** the same marks where text was typed or deleted before some of them: each keeps its look and length and sits at the
 * same offset from the block's start or from its end, so it draws where its text now is */
function shiftedMarks(before: BlockPaint, after: BlockPaint): boolean {
	const a = before.marks;
	const b = after.marks;
	const endA = before.node.nodeSize;
	const endB = after.node.nodeSize;
	return (
		a.length === b.length &&
		a.every((mark, i) => {
			const next = b[i];
			if (mark.look !== next.look || mark.to - mark.from !== next.to - next.from) return false;
			return mark.from === next.from || endA - mark.from === endB - next.from;
		})
	);
}

function sameBlock(a: BlockPaint, b: BlockPaint): boolean {
	return a.node === b.node && a.layout === b.layout && a.top === b.top && sameMarks(a.marks, b.marks);
}

function bandOf(block: BlockPaint): DocBand {
	return { from: block.top - INK_OVERFLOW, to: block.top + block.layout.height + INK_OVERFLOW };
}

function merged(bands: DocBand[]): DocBand[] {
	bands.sort((a, b) => a.from - b.from);
	const out: DocBand[] = [];
	for (const band of bands) {
		const last = out.at(-1);
		if (last && band.from <= last.to) out[out.length - 1] = { from: last.from, to: Math.max(last.to, band.to) };
		else out.push(band);
	}
	return out;
}

/** a block in place whose layout or node changed: the bands its new ink differs in, when the painter can tell */
function inkedBands(before: BlockPaint, after: BlockPaint, ink: InkChanges | undefined): DocBand[] | null {
	if (!ink || before.top !== after.top || before.layout.height !== after.layout.height || !shiftedMarks(before, after)) return null;
	const bands = ink(before, after);
	return bands && bands.map((band) => ({ from: after.top + band.from, to: after.top + band.to }));
}

/** what a row must repaint to show `next`: nothing, some doc bands, or all of it */
export function changedBands(previous: TileContent | null, next: TileContent, row: DocRect, ink?: InkChanges): 'all' | DocBand[] {
	if (!previous || previous.scene !== next.scene) return 'all';
	const kept = new Set<BlockPaint>();
	const bands: DocBand[] = [];
	for (const block of next.blocks) {
		const before = previous.blocks.find((old) => old.node === block.node || old.top === block.top);
		if (before && sameBlock(before, block)) {
			kept.add(before);
			continue;
		}
		const inked = before ? inkedBands(before, block, ink) : null;
		if (before && inked) kept.add(before);
		bands.push(...(inked ?? [bandOf(block)]));
	}
	for (const old of previous.blocks) if (!kept.has(old)) bands.push(bandOf(old));
	const inRow = merged(bands)
		.map((band) => ({ from: Math.max(band.from, row.y), to: Math.min(band.to, row.y + row.height) }))
		.filter((band) => band.to > band.from);
	const covered = inRow.reduce((sum, band) => sum + band.to - band.from, 0);
	return covered > WHOLE_ROW_SHARE * row.height ? 'all' : inRow;
}
