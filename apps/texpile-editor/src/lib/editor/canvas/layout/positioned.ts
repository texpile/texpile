// position: absolute, inset, % and translate (5.1)
import type { DocPoint, DocRect, LayoutBoxBuilder } from '../contracts/layoutTypes';
import type { LayoutStyle, Length, LengthOr } from '../contracts/styleTypes';

function insetPx(inset: LengthOr<'auto'>, of: number): number | null {
	return inset === 'auto' ? null : inset.px + (inset.percent / 100) * of;
}

function marginPx(margin: LayoutStyle['margin']['left'], of: number): number {
	return margin === 'auto' ? 0 : margin.px + (margin.percent / 100) * of;
}

function translatePx(length: Length, of: number): number {
	return length.px + (length.percent / 100) * of;
}

/** the width an absolute box takes its auto width from: the room its horizontal insets leave, and whether it fills it */
export function absoluteRoom(style: LayoutStyle, containing: DocRect): { width: number; fills: boolean } {
	const left = insetPx(style.inset.left, containing.width);
	const right = insetPx(style.inset.right, containing.width);
	return { width: Math.max(0, containing.width - (left ?? 0) - (right ?? 0)), fills: left !== null && right !== null };
}

/** an absolute box laid out at its width, placed by its insets in its containing block's padding box, else where it stood
 *  in flow, then moved by its translate */
export function placePositioned(draft: LayoutBoxBuilder, containing: DocRect, stood: DocPoint): void {
	const style = draft.style.layout;
	const { width, height } = containing;
	const left = insetPx(style.inset.left, width);
	const right = insetPx(style.inset.right, width);
	const top = insetPx(style.inset.top, height);
	const bottom = insetPx(style.inset.bottom, height);
	const marginLeft = marginPx(style.margin.left, width);
	const marginTop = marginPx(style.margin.top, width);
	draft.margin = {
		top: marginTop,
		right: marginPx(style.margin.right, width),
		bottom: marginPx(style.margin.bottom, width),
		left: marginLeft
	};
	// height auto between two insets fills the room they leave
	if (top !== null && bottom !== null && style.height === 'auto')
		draft.height = Math.max(0, height - top - bottom - marginTop - draft.margin.bottom);
	draft.x =
		left !== null
			? containing.x + left + marginLeft
			: right !== null
				? containing.x + width - right - draft.margin.right - draft.width
				: stood.x + marginLeft;
	draft.y =
		top !== null
			? containing.y + top + marginTop
			: bottom !== null
				? containing.y + height - bottom - draft.margin.bottom - draft.height
				: stood.y + marginTop;
	const translate = draft.style.layout.transform?.translate;
	if (!translate) return;
	draft.x += translatePx(translate.x, draft.width);
	draft.y += translatePx(translate.y, draft.height);
}
