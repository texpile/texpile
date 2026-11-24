// a line's inline backgrounds and its text with decorations, on the alphabetic baseline, ligatures kept apart (D31)
import type { LineBox, LineFragment } from '../contracts/layoutTypes';
import type { ComputedStyle, LayoutStyle, PaintStyle, RunStyle } from '../contracts/styleTypes';
import { HYPHEN } from '../layout/inline/inlineItems';
import { runBaselineOffset } from '../layout/inline/lineBoxes';
import type { FontMetrics, FontMetricsReader } from '../layout/text/fontMetrics';
import { canvasFontOf } from '../layout/text/fontStrings';
import { letterSpacingWithBreak, withoutLigatures } from '../layout/text/ligatures';
import { canvasFill } from '../style/resolve/colorValue';
import type { PaintOp } from './displayList';
import type { BoxAt } from './paintBoxes';

export type TextPaintTools = {
	readonly metrics: FontMetricsReader;
	/** how this engine keeps ligatures apart: the measurer measured the same way */
	readonly ligatureBreak: 'hair' | 'zwnj';
	/** a run or a style as it reads under the current paint epoch (a mode switch) */
	readonly run: (run: RunStyle) => RunStyle;
	readonly style: (style: ComputedStyle) => ComputedStyle;
};

type Drawn = { text: string; font: string; paint: PaintStyle; letterSpacing: number; baseline: number; metrics: FontMetrics; rtl: boolean };

// Chromium puts a line-through near half the x-height
const STRIKE_EM = 0.3;

function drawnOf(fragment: LineFragment, line: LineBox, block: LayoutStyle, tools: TextPaintTools): Drawn | null {
	if (fragment.kind === 'text' || fragment.kind === 'struck' || fragment.kind === 'hyphen') {
		if (fragment.kind === 'text' && fragment.text === '\t') return null;
		const run = tools.run(fragment.run);
		return {
			text: fragment.kind === 'hyphen' ? HYPHEN : fragment.text,
			font: run.fontString,
			paint: run.paint,
			letterSpacing: run.letterSpacing,
			baseline: line.baseline + runBaselineOffset(run, block, tools.metrics),
			metrics: tools.metrics(run.fontString),
			rtl: fragment.kind === 'text' && fragment.level % 2 === 1
		};
	}
	if (fragment.kind === 'generated') {
		const style = tools.style(fragment.style);
		const font = canvasFontOf(style.layout.font);
		return {
			text: fragment.text,
			font,
			paint: style.paint,
			letterSpacing: style.layout.letterSpacing,
			baseline: line.baseline,
			metrics: tools.metrics(font),
			rtl: false
		};
	}
	return null;
}

function decorationOps(x: number, width: number, drawn: Drawn, out: PaintOp[]): void {
	const decoration = drawn.paint.textDecoration;
	if (!decoration.lines.length || decoration.color.a === 0) return;
	const { metrics } = drawn;
	const thickness = typeof decoration.thickness === 'number' ? decoration.thickness : metrics.underlineThickness;
	const color = canvasFill(decoration.color);
	for (const kind of decoration.lines) {
		const below = typeof decoration.underlineOffset === 'number' ? decoration.underlineOffset : metrics.underlineOffset;
		const size = metrics.ascent + metrics.descent;
		const y =
			kind === 'underline'
				? drawn.baseline + below
				: kind === 'overline'
					? drawn.baseline - metrics.ascent
					: drawn.baseline - size * STRIKE_EM - thickness / 2;
		out.push({ kind: 'line', x, y, width, thickness, color, style: decoration.style });
	}
}

/** inline backgrounds of runs that have one, a stretch of equal runs filled as one box over their font's content area */
export function inlineBackgroundOps(placed: BoxAt, line: LineBox, block: LayoutStyle, tools: TextPaintTools, out: PaintOp[]): void {
	let open: { run: RunStyle; from: number; to: number } | null = null;
	function close(): void {
		if (!open) return;
		const { run } = open;
		const metrics = tools.metrics(run.fontString);
		const baseline = line.baseline + runBaselineOffset(run, block, tools.metrics);
		const { tl, tr, br, bl } = run.paint.borderRadius;
		out.push({
			kind: 'fill',
			rect: {
				x: placed.x + open.from,
				y: placed.y + baseline - metrics.ascent,
				width: open.to - open.from,
				height: metrics.ascent + metrics.descent
			},
			color: canvasFill(run.paint.backgroundColor),
			radii: tl || tr || br || bl ? run.paint.borderRadius : null
		});
		open = null;
	}
	for (const fragment of line.fragments) {
		const run = fragment.kind === 'text' || fragment.kind === 'edge' || fragment.kind === 'struck' ? tools.run(fragment.run) : null;
		if (!run || run.paint.backgroundColor.a === 0) {
			close();
			continue;
		}
		if (open && open.run.paintKey === run.paintKey && Math.abs(open.to - fragment.x) < 0.5) open.to = fragment.x + fragment.width;
		else {
			close();
			open = { run, from: fragment.x, to: fragment.x + fragment.width };
		}
	}
	close();
}

/** the line's text, generated text and hyphen with their decorations */
export function lineTextOps(placed: BoxAt, line: LineBox, block: LayoutStyle, tools: TextPaintTools, out: PaintOp[]): void {
	for (const fragment of line.fragments) {
		const drawn = drawnOf(fragment, line, block, tools);
		if (!drawn) continue;
		const x = placed.x + fragment.x;
		const baseline = placed.y + drawn.baseline;
		const hair = tools.ligatureBreak === 'hair';
		if (drawn.paint.color.a > 0)
			out.push({
				kind: 'text',
				x,
				y: baseline,
				text: hair ? drawn.text : withoutLigatures(drawn.text),
				font: drawn.font,
				color: canvasFill(drawn.paint.color),
				spacing: hair ? letterSpacingWithBreak(drawn.letterSpacing) : `${drawn.letterSpacing}px`,
				rtl: drawn.rtl
			});
		decorationOps(x, fragment.width, { ...drawn, baseline }, out);
	}
}
