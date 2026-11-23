// inline decoration fills in the line pass, under the selection and the text (6.3, 9.3)
import type { Node as PMNode } from 'prosemirror-model';
import type { InlineDecorationPaint, InlineDecorationView, LinePaintGeometry } from '../contracts/decorationTypes';
import type { TextMeasure } from '../contracts/layoutTypes';
import type { CanvasStyles, Rgba } from '../contracts/styleTypes';
import { changesLayout, decorationChain } from '../decorations/decorationRuns';
import { reachOf } from '../decorations/reachRule';
import type { BlockOnModel } from '../geometry/lineIndex';
import { lineX } from '../geometry/positionMap';
import type { FontMetricsReader } from '../layout/text/fontMetrics';
import { bandsUnder, runBand } from './decorationBands';
import { snapRect, type DevicePixels } from './devicePixels';

export type InlineDecorationTools = {
	readonly styles: Pick<CanvasStyles, 'runStyle'>;
	readonly measure: TextMeasure;
	readonly metrics?: FontMetricsReader;
};

function fillOf(color: Rgba): string {
	return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`;
}

/** a comment composer's held passage, in the selection's color: it replaces the selection's shade while the focus is away */
export function heldPassageShown(inline: readonly InlineDecorationView[]): boolean {
	return inline.some((decoration) => decoration.classes.includes('pm-comment-pending'));
}

/** backgrounds over the line box (reach line) or the content area (reach text), one CSS inline box per line */
export function paintInlineDecorations(
	ctx: CanvasRenderingContext2D,
	geometry: LinePaintGeometry,
	decorations: readonly InlineDecorationPaint[],
	px: DevicePixels
): void {
	const { line, top, left } = geometry;
	for (const decoration of decorations) {
		const background = decoration.style.paint.backgroundColor;
		const from = Math.max(decoration.from, line.from);
		const to = Math.min(decoration.to, line.to);
		if ((background.a === 0 && !decoration.style.bottomBorder) || to < from || (to === from && decoration.from !== decoration.to)) continue;
		const x0 = geometry.xAt(from);
		const x1 = Math.max(x0 + 1, geometry.xAt(to) + (decoration.to > line.to ? line.endExtension : 0));
		const [y, height] = decoration.reach === 'line' ? [line.y, line.height] : [line.textTop, line.textBottom - line.textTop];
		const spans: [number, number][] = [[x0, x1]];
		const bands = geometry.runBand
			? bandsUnder(line, spans, (run) => geometry.runBand!(run, decoration.reach), { y, height })
			: spans.map(([start, end]) => ({ start, end, y, height }));
		// eslint-disable-next-line no-param-reassign -- painting sets the canvas context's state
		ctx.fillStyle = fillOf(background);
		for (const band of bands) {
			const fill = snapRect({ x: left + band.start, y: top + band.y, width: band.end - band.start, height: band.height }, px);
			ctx.fillRect(fill.x, fill.y, fill.width, fill.height);
		}
		const border = decoration.style.bottomBorder;
		if (border) paintBottomBorder(ctx, border, spans, left, top + line.textBottom, px);
	}
}

/** an inline box's bottom border under its content area: dots a border wide, a border apart, or one rule */
function paintBottomBorder(
	ctx: CanvasRenderingContext2D,
	border: NonNullable<InlineDecorationPaint['style']['bottomBorder']>,
	spans: readonly (readonly [number, number])[],
	left: number,
	y: number,
	px: DevicePixels
): void {
	// eslint-disable-next-line no-param-reassign -- painting sets the canvas context's state
	ctx.fillStyle = fillOf(border.color);
	const { width } = border;
	for (const [start, end] of spans) {
		if (border.style !== 'dotted') {
			const rule = snapRect({ x: left + start, y, width: end - start, height: width }, px);
			ctx.fillRect(rule.x, rule.y, rule.width, rule.height);
			continue;
		}
		for (let x = start; x + width <= end + 0.01; x += width * 2) {
			const dot = snapRect({ x: left + x, y, width, height: width }, px);
			ctx.fillRect(dot.x, dot.y, dot.width, dot.height);
		}
	}
}

/** the frame's paint-only inline decorations over one laid-out block; the ones that change layout are in its runs */
export function paintBlockDecorations(
	ctx: CanvasRenderingContext2D,
	block: BlockOnModel,
	inline: readonly InlineDecorationView[],
	tools: InlineDecorationTools,
	px: DevicePixels
): void {
	if (!inline.length) return;
	const top: PMNode = block.node;
	for (const textblock of block.placement.textblocks) {
		const hole = textblock.box.element;
		const start = block.frame.pos + textblock.offset + 1;
		const end = start + textblock.node.content.size;
		if (!hole) continue;
		const paints: InlineDecorationPaint[] = [];
		for (const decoration of inline) {
			if (decoration.to < start || decoration.from > end || changesLayout(tools.styles, decoration)) continue;
			const style = tools.styles.runStyle(hole, decorationChain([decoration]));
			paints.push({
				from: decoration.from - block.frame.pos,
				to: decoration.to - block.frame.pos,
				style,
				reach: reachOf(decoration.classes)
			});
		}
		if (!paints.length) continue;
		textblock.lines.forEach((line, index) => {
			const { metrics } = tools;
			const geometry: LinePaintGeometry = {
				line,
				top: textblock.y,
				left: textblock.x,
				xAt: (offset) => lineX(textblock, index, offset, 1, { top, measure: tools.measure }),
				runBand: metrics && ((run, reach) => runBand(run, line, textblock.box.style.layout, metrics, reach))
			};
			paintInlineDecorations(ctx, geometry, paints, px);
		});
	}
}
