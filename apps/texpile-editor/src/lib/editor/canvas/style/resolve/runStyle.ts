// a text run's style from its block's style and its chain levels' styles, outermost first
import type { ComputedStyle, PaintStyle, RunStyle, TextDecoration } from '../../contracts/styleTypes';
import { canvasFontOf } from '../../layout/text/fontStrings';
import { TRANSPARENT } from './colorValue';

/** CSS decorations propagate to descendants: the run draws every line an ancestor level asked for */
function propagatedDecoration(levels: readonly ComputedStyle[]): TextDecoration {
	const innermost = levels.at(-1)!.paint.textDecoration;
	const lines = new Set(levels.flatMap((style) => style.paint.textDecoration.lines));
	if (!lines.size || lines.size === innermost.lines.length) return innermost;
	const outer = levels.findLast((style) => style.paint.textDecoration.lines.length)!.paint.textDecoration;
	return { ...outer, lines: [...lines] };
}

function inlineSide(style: ComputedStyle, side: 'left' | 'right'): number {
	return (
		style.layout.padding[side].px +
		style.layout.borderWidth[side] +
		(style.layout.margin[side] === 'auto' ? 0 : style.layout.margin[side].px)
	);
}

/** relative offsets along the chain (preflight's sup and sub), positive down */
function relativeShift(levels: readonly ComputedStyle[]): number {
	let shift = 0;
	for (const { layout } of levels) {
		if (layout.position !== 'relative') continue;
		const { top, bottom } = layout.inset;
		if (top !== 'auto') shift += top.px;
		else if (bottom !== 'auto') shift -= bottom.px;
	}
	return shift;
}

/** equal values share a key: runs compare layout and paint by integer */
export class RunKeys {
	private readonly layoutKeys = new Map<string, number>();
	private readonly paintKeys = new Map<string, number>();

	layout(value: unknown): number {
		return keyOf(this.layoutKeys, value);
	}

	paint(value: unknown): number {
		return keyOf(this.paintKeys, value);
	}
}

function keyOf(keys: Map<string, number>, value: unknown): number {
	const text = JSON.stringify(value);
	let id = keys.get(text);
	if (id === undefined) keys.set(text, (id = keys.size + 1));
	return id;
}

export function runStyleOf(blockStyle: ComputedStyle, levels: readonly ComputedStyle[], keys: RunKeys): RunStyle {
	const innermost = levels.at(-1) ?? blockStyle;
	const { layout } = innermost;
	const edges = {
		start: levels.reduce((sum, style) => sum + inlineSide(style, 'left'), 0),
		end: levels.reduce((sum, style) => sum + inlineSide(style, 'right'), 0)
	};
	const blockEdges = levels.length
		? { top: layout.padding.top.px + layout.borderWidth.top, bottom: layout.padding.bottom.px + layout.borderWidth.bottom }
		: { top: 0, bottom: 0 };
	const shift = relativeShift(levels);
	const border = layout.borderWidth.bottom;
	const bottomBorder =
		levels.length && border > 0 && layout.borderStyle.bottom !== 'none' && innermost.paint.borderColor.bottom.a > 0
			? { width: border, style: layout.borderStyle.bottom, color: innermost.paint.borderColor.bottom }
			: undefined;
	// a background is not inherited: text straight in a block paints none of its own over the block's
	const paint: PaintStyle = levels.length
		? { ...innermost.paint, textDecoration: propagatedDecoration(levels) }
		: { ...innermost.paint, backgroundColor: TRANSPARENT };
	return {
		id: innermost.id,
		layoutKey: keys.layout([
			layout.font,
			layout.letterSpacing,
			layout.wordSpacing,
			layout.textTransform,
			layout.verticalAlign,
			layout.lineHeight,
			edges,
			shift
		]),
		paintKey: keys.paint(paint),
		font: layout.font,
		fontString: canvasFontOf(layout.font),
		letterSpacing: layout.letterSpacing,
		wordSpacing: layout.wordSpacing,
		textTransform: layout.textTransform,
		verticalAlign: layout.verticalAlign,
		edges,
		blockEdges,
		paint,
		shift,
		lineHeight: layout.lineHeight,
		bottomBorder
	};
}
