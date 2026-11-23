// a laid-out block's drawing as data, in its own space (origin at its top, x from the column origin), replayed per frame
import type { ReplacedContent, ThemeTokenColor } from '../contracts/faceTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { BorderStyle, ComputedStyle, Corners, Edges, PaintStyle, Shadow, TextDecoration } from '../contracts/styleTypes';
import type { BlockPlacement, PlacedBox } from '../geometry/lineIndex';
import { aboutPoint, orientMatrix, transformMatrixOf, turnsContent, type TransformMatrix } from '../layout/transforms';
import { collapsedBordersOf, collapsesBorders } from '../layout/table/tableBorders';
import { canvasFill } from '../style/resolve/colorValue';
import { devicePixelsOf, snapRect, snapWidth, type DevicePixels } from './devicePixels';
import { borderBoxOf, boxOps, contentBoxOf, outlineOp } from './paintBoxes';
import { inlineBackgroundOps, lineTextOps, type TextPaintTools } from './paintText';
import { maxScrollLeft, scrollLeftOf } from '../layout/scrollBox';

export type PaintOp =
	| { kind: 'fill'; rect: DocRect; color: string; radii: Corners<number> | null }
	| {
			kind: 'border';
			rect: DocRect;
			widths: Edges<number>;
			colors: Edges<string>;
			styles: Edges<BorderStyle>;
			radii: Corners<number> | null;
	  }
	| { kind: 'shadow'; rect: DocRect; radii: Corners<number> | null; shadow: Shadow; color: string }
	| { kind: 'text'; x: number; y: number; text: string; font: string; color: string; spacing: string; rtl: boolean }
	| { kind: 'line'; x: number; y: number; width: number; thickness: number; color: string; style: TextDecoration['style'] }
	| { kind: 'outline'; rect: DocRect; width: number; color: string; style: BorderStyle; radii: Corners<number> | null }
	| { kind: 'replaced'; content: ReplacedContent; box: DocRect; style: PaintStyle }
	| { kind: 'push'; alpha: number; clip: DocRect | null; frame?: TransformMatrix; content?: TransformMatrix }
	| { kind: 'pop' };

/** a block's lists: what goes under the selection, and the text and atoms over it */
export type BlockDisplayList = {
	readonly under: readonly PaintOp[];
	readonly over: readonly PaintOp[];
	readonly outlines: readonly PaintOp[];
};

type PaintContext = CanvasRenderingContext2D;

function noRadii(radii: Corners<number> | null): boolean {
	return !radii || (!radii.tl && !radii.tr && !radii.br && !radii.bl);
}

function roundedPath(ctx: PaintContext, rect: DocRect, radii: Corners<number> | null): void {
	ctx.beginPath();
	if (noRadii(radii)) ctx.rect(rect.x, rect.y, rect.width, rect.height);
	else ctx.roundRect(rect.x, rect.y, rect.width, rect.height, [radii!.tl, radii!.tr, radii!.br, radii!.bl]);
}

function dashOf(style: BorderStyle, width: number): number[] {
	if (style === 'dashed') return [width * 3, width * 3];
	if (style === 'dotted') return [width, width];
	return [];
}

function drawBorder(ctx: PaintContext, op: PaintOp & { kind: 'border' }, px: DevicePixels): void {
	const { colors, styles, radii } = op;
	const rect = snapRect(op.rect, px);
	const widths = {
		top: snapWidth(op.widths.top, px.sy),
		right: snapWidth(op.widths.right, px.sx),
		bottom: snapWidth(op.widths.bottom, px.sy),
		left: snapWidth(op.widths.left, px.sx)
	};
	const sides = ['top', 'right', 'bottom', 'left'] as const;
	const uniform = sides.every((side) => widths[side] === widths.top && colors[side] === colors.top && styles[side] === styles.top);
	if (uniform && widths.top > 0 && styles.top !== 'none' && styles.top !== 'hidden') {
		const half = widths.top / 2;
		Object.assign(ctx, { strokeStyle: colors.top, lineWidth: widths.top });
		ctx.setLineDash(dashOf(styles.top, widths.top));
		roundedPath(ctx, { x: rect.x + half, y: rect.y + half, width: rect.width - widths.top, height: rect.height - widths.top }, radii);
		ctx.stroke();
		ctx.setLineDash([]);
		return;
	}
	for (const side of sides) {
		const width = widths[side];
		if (!width || styles[side] === 'none' || styles[side] === 'hidden') continue;
		const band =
			side === 'top' || side === 'bottom'
				? { x: rect.x, y: side === 'top' ? rect.y : rect.y + rect.height - width, width: rect.width, height: width }
				: { x: side === 'left' ? rect.x : rect.x + rect.width - width, y: rect.y, width, height: rect.height };
		drawBorderBand(ctx, band, styles[side], colors[side], side === 'top' || side === 'bottom');
	}
}

/** Chromium's dashes along one side: 3 by 2 widths (2 by 1 from 3px), the gap fitted so a dash ends each end */
function sideDash(style: BorderStyle, width: number, length: number): number[] {
	const thick = width >= 3;
	const dash = style === 'dotted' ? width : width * (thick ? 2 : 3);
	const gap = style === 'dotted' ? width : width * (thick ? 1 : 2);
	const fewer = Math.floor((length + gap) / (dash + gap));
	function gapFor(dashes: number): number {
		return dashes > 1 ? (length - dashes * dash) / (dashes - 1) : Infinity;
	}
	const [low, high] = [gapFor(fewer), gapFor(fewer + 1)];
	return [dash, high <= 0 || Math.abs(low - gap) < Math.abs(high - gap) ? low : high];
}

/** one side's band: dashes and dots along its middle, a double side as two thirds of it */
function drawBorderBand(ctx: PaintContext, band: DocRect, style: BorderStyle, color: string, horizontal: boolean): void {
	const width = horizontal ? band.height : band.width;
	if (style === 'dashed' || style === 'dotted') {
		Object.assign(ctx, { strokeStyle: color, lineWidth: width });
		ctx.setLineDash(sideDash(style, width, horizontal ? band.width : band.height));
		ctx.beginPath();
		if (horizontal) {
			ctx.moveTo(band.x, band.y + width / 2);
			ctx.lineTo(band.x + band.width, band.y + width / 2);
		} else {
			ctx.moveTo(band.x + width / 2, band.y);
			ctx.lineTo(band.x + width / 2, band.y + band.height);
		}
		ctx.stroke();
		ctx.setLineDash([]);
		return;
	}
	Object.assign(ctx, { fillStyle: color });
	if (style !== 'double' || width < 3) {
		ctx.fillRect(band.x, band.y, band.width, band.height);
		return;
	}
	const line = Math.round(width / 3);
	if (horizontal) {
		ctx.fillRect(band.x, band.y, band.width, line);
		ctx.fillRect(band.x, band.y + width - line, band.width, line);
	} else {
		ctx.fillRect(band.x, band.y, line, band.height);
		ctx.fillRect(band.x + width - line, band.y, line, band.height);
	}
}

/** an outer box shadow: the shape drawn far off with the shadow offset back, so the box itself stays unpainted */
function drawShadow(ctx: PaintContext, op: PaintOp & { kind: 'shadow' }): void {
	const { rect, shadow, radii } = op;
	const far = 100000;
	const grown = {
		x: rect.x - shadow.spread - far,
		y: rect.y - shadow.spread,
		width: rect.width + 2 * shadow.spread,
		height: rect.height + 2 * shadow.spread
	};
	ctx.save();
	Object.assign(ctx, {
		shadowColor: op.color,
		shadowBlur: shadow.blur,
		shadowOffsetX: shadow.x + far,
		shadowOffsetY: shadow.y,
		fillStyle: '#000'
	});
	roundedPath(ctx, grown, radii);
	ctx.fill();
	ctx.restore();
}

function drawLine(ctx: PaintContext, op: PaintOp & { kind: 'line' }, px: DevicePixels): void {
	const { x, y, width, thickness, color, style } = op;
	if (style === 'solid' || style === 'double') {
		Object.assign(ctx, { fillStyle: color });
		const rule = snapRect({ x, y, width, height: thickness }, px);
		ctx.fillRect(rule.x, rule.y, rule.width, rule.height);
		if (style === 'double') ctx.fillRect(rule.x, rule.y + rule.height * 2, rule.width, rule.height);
		return;
	}
	Object.assign(ctx, { strokeStyle: color, lineWidth: thickness });
	ctx.beginPath();
	const middle = y + thickness / 2;
	if (style === 'wavy') {
		const step = thickness * 2;
		ctx.moveTo(x, middle);
		for (let at = x, up = true; at < x + width; at += step, up = !up)
			ctx.quadraticCurveTo(at + step / 2, middle + (up ? -step : step), Math.min(at + step, x + width), middle);
	} else {
		ctx.setLineDash(dashOf(style, thickness));
		ctx.moveTo(x, middle);
		ctx.lineTo(x + width, middle);
	}
	ctx.stroke();
	ctx.setLineDash([]);
}

type TextState = { font: string; color: string; spacing: string; rtl: boolean };

/** the context's text state as the last text op set it; the font and spacing setters parse their strings every time */
function drawText(ctx: PaintContext, op: PaintOp & { kind: 'text' }, last: TextState | null): TextState {
	const changed: Partial<PaintContext> = last ? {} : { textAlign: 'left', textBaseline: 'alphabetic' };
	if (last?.font !== op.font) changed.font = op.font;
	if (last?.color !== op.color) changed.fillStyle = op.color;
	if (last?.spacing !== op.spacing) changed.letterSpacing = op.spacing;
	if (last?.rtl !== op.rtl) changed.direction = op.rtl ? 'rtl' : 'ltr';
	Object.assign(ctx, changed);
	ctx.fillText(op.text, op.x, op.y);
	return op;
}

export function replayDisplayList(
	ctx: PaintContext,
	ops: readonly PaintOp[],
	token: ThemeTokenColor,
	px: DevicePixels = devicePixelsOf(ctx)
): void {
	let text: TextState | null = null;
	for (const op of ops) {
		if (op.kind !== 'text') text = null;
		switch (op.kind) {
			case 'fill': {
				Object.assign(ctx, { fillStyle: op.color });
				const rect = snapRect(op.rect, px);
				if (noRadii(op.radii)) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
				else {
					roundedPath(ctx, rect, op.radii);
					ctx.fill();
				}
				break;
			}
			case 'border':
				drawBorder(ctx, op, px);
				break;
			case 'shadow':
				drawShadow(ctx, op);
				break;
			case 'text':
				text = drawText(ctx, op, text);
				break;
			case 'line':
				drawLine(ctx, op, px);
				break;
			case 'outline': {
				const width = snapWidth(op.width, px.sx);
				const rect = snapRect(op.rect, px);
				const grow = width / 2;
				Object.assign(ctx, { strokeStyle: op.color, lineWidth: width });
				ctx.setLineDash(dashOf(op.style, width));
				roundedPath(ctx, { x: rect.x - grow, y: rect.y - grow, width: rect.width + width, height: rect.height + width }, op.radii);
				ctx.stroke();
				ctx.setLineDash([]);
				break;
			}
			case 'replaced':
				ctx.save();
				op.content.paint(ctx, op.box, op.style, token);
				ctx.restore();
				break;
			case 'push':
				ctx.save();
				if (op.alpha < 1) Object.assign(ctx, { globalAlpha: ctx.globalAlpha * op.alpha });
				if (op.frame) ctx.transform(...op.frame);
				if (op.clip) {
					const clip = snapRect(op.clip, px);
					ctx.beginPath();
					ctx.rect(clip.x, clip.y, clip.width, clip.height);
					ctx.clip();
				}
				if (op.content) ctx.transform(...op.content);
				break;
			case 'pop':
				ctx.restore();
				break;
		}
	}
}

/** the borders a collapsing table resolved, over its cells' backgrounds; each in its source's current color */
function collapsedBorderOps(placed: PlacedBox, tools: TextPaintTools, out: PaintOp[]): void {
	for (const segment of collapsedBordersOf(placed.box)) {
		const vertical = segment.side === 'left' || segment.side === 'right';
		const paint = tools.style(segment.source).paint.borderColor[segment.side];
		if (paint.a === 0) continue;
		const color = canvasFill(paint);
		const side = vertical ? 'left' : 'top';
		out.push({
			kind: 'border',
			rect: { ...segment.rect, x: placed.x + segment.rect.x, y: placed.y + segment.rect.y },
			widths: { top: 0, right: 0, bottom: 0, left: 0, [side]: segment.width },
			styles: { top: 'none', right: 'none', bottom: 'none', left: 'none', [side]: segment.style },
			colors: { top: color, right: color, bottom: color, left: color },
			radii: null
		});
	}
}

/** a box's own transform, and the quarter turn of a vertical-rl frame, about its place on the page */
function transformsOf(placed: PlacedBox, style: ComputedStyle): { frame?: TransformMatrix; content?: TransformMatrix } {
	const { box } = placed;
	const frame = transformMatrixOf(style, box);
	const turns = turnsContent(style.layout, placed.parent?.box.style.layout ?? null);
	return {
		...(frame && { frame: aboutPoint(frame, placed.x, placed.y) }),
		...(turns && { content: aboutPoint(orientMatrix(box), placed.x, placed.y) })
	};
}

/** CSS painting order: backgrounds and borders under the selection; text, atoms and replaced content over it; outlines last */
// the thumb of a box that scrolls sideways: a flat bar at its foot, as wide as the share of the content it shows
const THUMB_HEIGHT = 4;
const THUMB_INSET = 2;
const THUMB_COLOR = 'rgba(128, 128, 128, 0.45)';

function scrollThumbOf(placed: PlacedBox): PaintOp | null {
	const { box } = placed;
	const max = maxScrollLeft(box);
	if (!max) return null;
	const share = box.width / (box.width + max);
	const rect = {
		x: placed.x + scrollLeftOf(box) * share,
		y: placed.y + box.height - THUMB_HEIGHT - THUMB_INSET,
		width: box.width * share,
		height: THUMB_HEIGHT
	};
	const round = THUMB_HEIGHT / 2;
	return { kind: 'fill', rect, color: THUMB_COLOR, radii: { tl: round, tr: round, br: round, bl: round } };
}

export function buildDisplayList(placement: BlockPlacement, tools: TextPaintTools): BlockDisplayList {
	const under: PaintOp[] = [];
	const over: PaintOp[] = [];
	const outlines: PaintOp[] = [];
	function walk(placed: PlacedBox, inAtom: boolean): void {
		const { box } = placed;
		const style = tools.style(box.style);
		const visible = style.layout.visibility === 'visible';
		const turned = transformsOf(placed, style);
		const group = style.paint.opacity < 1 || box.clip || !!turned.frame || !!turned.content;
		const own = inAtom ? over : under;
		if (group) {
			const push: PaintOp = { kind: 'push', alpha: style.paint.opacity, clip: box.clip ? borderBoxOf(placed) : null, ...turned };
			under.push(push);
			over.push(push);
		}
		if (visible) boxOps(placed, style.paint, own, !collapsesBorders(box.style.layout));
		const replaced = box.element?.replaced;
		if (visible && replaced) over.push({ kind: 'replaced', content: replaced, box: contentBoxOf(placed), style: style.paint });
		for (const line of box.lines ?? []) {
			if (visible) {
				inlineBackgroundOps(placed, line, style.layout, tools, own);
				lineTextOps(placed, line, style.layout, tools, over);
			}
			for (const fragment of line.fragments) {
				const inner = fragment.kind === 'atomic' || fragment.kind === 'widget' ? fragment.box : null;
				const innerPlaced = inner && placement.placed.get(inner);
				if (innerPlaced) walk(innerPlaced, true);
			}
		}
		for (const child of placement.children.get(placed) ?? []) walk(child, inAtom);
		if (visible && box.kind === 'table') collapsedBorderOps(placed, tools, own);
		const thumb = visible ? scrollThumbOf(placed) : null;
		if (thumb) over.push(thumb);
		if (group) {
			under.push({ kind: 'pop' });
			over.push({ kind: 'pop' });
		}
		const outline = visible ? outlineOp(placed, style.paint) : null;
		if (outline) outlines.push(outline);
	}
	walk(placement.boxes[0], false);
	return { under, over, outlines };
}
