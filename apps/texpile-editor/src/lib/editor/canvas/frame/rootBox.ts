// the editor root box the engine lays out in view.dom (5.2, 4.9): its margin, the page view sheet and its padding
import type { DocRect } from '../contracts/layoutTypes';
import type { LayoutStyle } from '../contracts/styleTypes';
import { blockWidth, horizontalPadding, lengthPx, verticalPadding } from '../layout/blockFlow';

export type RootBox = {
	/** the column origin in view.dom's box: margin, border and padding before the content */
	readonly left: number;
	readonly top: number;
	/** the column width the blocks lay out at */
	readonly width: number;
	/** border and padding around the content, and the margin below the border box */
	readonly insetTop: number;
	readonly insetLeft: number;
	readonly insetBottom: number;
	readonly marginBottom: number;
	/** the border box's width */
	readonly sheetWidth: number;
	/** min-height as a content height */
	readonly minContent: number;
};

export const NO_ROOT_BOX: RootBox = {
	left: 0,
	top: 0,
	width: 0,
	insetTop: 0,
	insetLeft: 0,
	insetBottom: 0,
	marginBottom: 0,
	sheetWidth: 0,
	minContent: 0
};

function marginPx(margin: LayoutStyle['margin']['top'], containing: number): number {
	return margin === 'auto' ? 0 : lengthPx(margin, containing);
}

/** outer: view.dom's width, which the canvas root sheet leaves to its container */
export function rootBoxOf(style: LayoutStyle, outer: number): RootBox {
	const { width, marginLeft } = blockWidth(style, outer, () => ({ min: 0, max: outer }));
	const insetLeft = style.borderWidth.left + lengthPx(style.padding.left, outer);
	const insetTop = style.borderWidth.top + lengthPx(style.padding.top, outer);
	const vertical = verticalPadding(style, outer);
	const minHeight = style.minHeight === 'auto' ? 0 : lengthPx(style.minHeight, 0);
	return {
		left: marginLeft + insetLeft,
		top: marginPx(style.margin.top, outer) + insetTop,
		width: Math.max(0, width - horizontalPadding(style, outer)),
		insetTop,
		insetLeft,
		insetBottom: vertical - insetTop,
		marginBottom: marginPx(style.margin.bottom, outer),
		sheetWidth: width,
		minContent: Math.max(0, style.boxSizing === 'border-box' ? minHeight - vertical : minHeight)
	};
}

/** view.dom's height for a document this tall */
export function rootOuterHeight(root: RootBox, height: number): number {
	return root.top + Math.max(height, root.minContent) + root.insetBottom + root.marginBottom;
}

/** the root's border box in doc space, where the page view sheet paints */
export function rootSheetRect(root: RootBox, height: number): DocRect {
	const content = Math.max(height, root.minContent);
	return { x: -root.insetLeft, y: -root.insetTop, width: root.sheetWidth, height: root.insetTop + content + root.insetBottom };
}
