// a box's own painting in CSS order: outer shadows, the background inside its radii, borders; outlines come last (6.2)
import type { DocRect, LayoutBox } from '../contracts/layoutTypes';
import type { Corners, LayoutStyle, PaintStyle } from '../contracts/styleTypes';
import { canvasFill } from '../style/resolve/colorValue';
import type { PaintOp } from './displayList';

const NO_BORDERS: Pick<LayoutStyle, 'borderWidth' | 'borderStyle'> = {
	borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
	borderStyle: { top: 'none', right: 'none', bottom: 'none', left: 'none' }
};

/** a box placed in its block's own space */
export type BoxAt = { readonly box: LayoutBox; readonly x: number; readonly y: number };

function radiiOf(paint: PaintStyle): Corners<number> | null {
	const { tl, tr, br, bl } = paint.borderRadius;
	return tl || tr || br || bl ? paint.borderRadius : null;
}

export function borderBoxOf(placed: BoxAt): DocRect {
	return { x: placed.x, y: placed.y, width: placed.box.width, height: placed.box.height };
}

/** the content box, where replaced content draws */
export function contentBoxOf(placed: BoxAt): DocRect {
	const { layout } = placed.box.style;
	const left = layout.borderWidth.left + layout.padding.left.px;
	const top = layout.borderWidth.top + layout.padding.top.px;
	const right = layout.borderWidth.right + layout.padding.right.px;
	const bottom = layout.borderWidth.bottom + layout.padding.bottom.px;
	return {
		x: placed.x + left,
		y: placed.y + top,
		width: Math.max(0, placed.box.width - left - right),
		height: Math.max(0, placed.box.height - top - bottom)
	};
}

/** ownBorders false: a part of a collapsing table, whose borders the table draws */
export function boxOps(placed: BoxAt, paint: PaintStyle, out: PaintOp[], ownBorders = true): void {
	rectBoxOps(borderBoxOf(placed), ownBorders ? placed.box.style.layout : NO_BORDERS, paint, out);
}

/** a border box's shadows, background and borders by its rect: a laid-out box, or the editor root's page sheet */
export function rectBoxOps(
	rect: DocRect,
	layout: Pick<LayoutStyle, 'borderWidth' | 'borderStyle'>,
	paint: PaintStyle,
	out: PaintOp[]
): void {
	const radii = radiiOf(paint);
	for (const shadow of paint.boxShadow)
		if (!shadow.inset && shadow.color.a > 0) out.push({ kind: 'shadow', rect, radii, shadow, color: canvasFill(shadow.color) });
	if (paint.backgroundColor.a > 0) out.push({ kind: 'fill', rect, color: canvasFill(paint.backgroundColor), radii });
	const { borderWidth, borderStyle } = layout;
	if (borderWidth.top || borderWidth.right || borderWidth.bottom || borderWidth.left) {
		const { borderColor } = paint;
		out.push({
			kind: 'border',
			rect,
			widths: borderWidth,
			styles: borderStyle,
			colors: {
				top: canvasFill(borderColor.top),
				right: canvasFill(borderColor.right),
				bottom: canvasFill(borderColor.bottom),
				left: canvasFill(borderColor.left)
			},
			radii
		});
	}
}

/** outside the border box by its offset; the selected node's outline is one (6.4) */
export function outlineOp(placed: BoxAt, paint: PaintStyle): PaintOp | null {
	const outline = paint.outline;
	if (!outline || outline.width <= 0 || outline.style === 'none' || outline.color.a === 0) return null;
	const rect = borderBoxOf(placed);
	const offset = outline.offset;
	const grown = { x: rect.x - offset, y: rect.y - offset, width: rect.width + 2 * offset, height: rect.height + 2 * offset };
	const radii = radiiOf(paint);
	const outer = radii && { tl: radii.tl + offset, tr: radii.tr + offset, br: radii.br + offset, bl: radii.bl + offset };
	return { kind: 'outline', rect: grown, width: outline.width, color: canvasFill(outline.color), style: outline.style, radii: outer };
}
