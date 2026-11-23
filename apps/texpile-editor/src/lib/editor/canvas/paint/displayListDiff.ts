// where a block's new display list draws differently from the one its row holds, as y bands in the block's space, so
// a key repaints the lines it changed (2.5)
import type { BlockDisplayList, PaintOp } from './displayList';

export type InkBand = { readonly from: number; readonly to: number };

/** a group (opacity, clip) changed: its whole box may draw differently */
const WHOLE = null;

function fontSize(font: string): number {
	return Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
}

/** the y extent an op may ink, generous at glyph tops, descenders, shadows and outlines */
function bandOf(op: PaintOp): InkBand | typeof WHOLE {
	switch (op.kind) {
		case 'text': {
			const size = fontSize(op.font);
			return { from: op.y - 1.2 * size, to: op.y + 0.6 * size };
		}
		case 'line':
			return { from: op.y - 2 * op.thickness, to: op.y + 3 * op.thickness };
		case 'shadow': {
			const reach = 2 * op.shadow.blur + Math.abs(op.shadow.spread) + Math.abs(op.shadow.y) + 1;
			return { from: op.rect.y - reach, to: op.rect.y + op.rect.height + reach };
		}
		case 'outline':
			return { from: op.rect.y - op.width - 2, to: op.rect.y + op.rect.height + op.width + 2 };
		case 'replaced':
			return { from: op.box.y - 1, to: op.box.y + op.box.height + 1 };
		case 'fill':
		case 'border':
			return { from: op.rect.y - 1, to: op.rect.y + op.rect.height + 1 };
		default:
			return WHOLE;
	}
}

function mathKeyOf(op: PaintOp & { kind: 'replaced' }): string | null {
	const { keys } = op.content;
	return keys?.length && keys.every((key) => key.kind === 'math') ? JSON.stringify(keys) : null;
}

/** a formula draws what its math key names, so two layouts of one paragraph rebuild it and still draw the same; other
 * replaced content (a bitmap that decodes later) is the same only as the same object */
function sameReplaced(a: PaintOp & { kind: 'replaced' }, b: PaintOp & { kind: 'replaced' }): boolean {
	if (JSON.stringify(a.box) !== JSON.stringify(b.box) || JSON.stringify(a.style.color) !== JSON.stringify(b.style.color)) return false;
	if (a.content === b.content) return true;
	const key = mathKeyOf(a);
	return key !== null && key === mathKeyOf(b);
}

function sameOp(a: PaintOp, b: PaintOp): boolean {
	if (a.kind === 'text' && b.kind === 'text')
		return (
			a.y === b.y &&
			a.x === b.x &&
			a.text === b.text &&
			a.font === b.font &&
			a.color === b.color &&
			a.spacing === b.spacing &&
			a.rtl === b.rtl
		);
	if (a.kind === 'replaced' && b.kind === 'replaced') return sameReplaced(a, b);
	return a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);
}

/** the ops between the common head and tail of two lists, from both */
function middleOf(before: readonly PaintOp[], after: readonly PaintOp[]): PaintOp[] {
	let head = 0;
	while (head < before.length && head < after.length && sameOp(before[head], after[head])) head++;
	let tail = 0;
	while (
		tail < before.length - head &&
		tail < after.length - head &&
		sameOp(before[before.length - 1 - tail], after[after.length - 1 - tail])
	)
		tail++;
	return [...before.slice(head, before.length - tail), ...after.slice(head, after.length - tail)];
}

/** the bands where `after` inks differently; null when a group changed and the whole block must repaint. A replaced
 * content that draws differently is a new content object or a new box */
export function inkChanges(before: BlockDisplayList, after: BlockDisplayList): InkBand[] | null {
	const changed: PaintOp[] = [];
	for (const part of ['under', 'over', 'outlines'] as const) changed.push(...middleOf(before[part], after[part]));
	const bands: InkBand[] = [];
	for (const op of changed) {
		const band = bandOf(op);
		if (!band) return WHOLE;
		bands.push(band);
	}
	bands.sort((a, b) => a.from - b.from);
	const merged: InkBand[] = [];
	for (const band of bands) {
		const last = merged.at(-1);
		if (last && band.from <= last.to) merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, band.to) };
		else merged.push(band);
	}
	return merged;
}
