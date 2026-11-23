// replaced elements: intrinsic size, width and height, min and max, aspect-ratio (5.1)
import type { ReplacedContent } from '../contracts/faceTypes';
import type { ComputedStyle } from '../contracts/styleTypes';
import { horizontalPadding, lengthPx, verticalPadding } from './blockFlow';

/** the content box's size, and the baseline from its top */
export type ReplacedSize = { width: number; height: number; baseline: number };

function contentSize(value: number, padding: number, borderBox: boolean): number {
	return Math.max(0, borderBox ? value - padding : value);
}

/** CSS 2.1 10.3.2 and 10.6.2: the size a width and a height, either or both auto, and the natural ratio make */
/** `containingWidth` null: an intrinsic size, where percentages of the width do not resolve (css-sizing 5.2.1) */
export function sizeReplaced(content: ReplacedContent, style: ComputedStyle, containingWidth: number | null): ReplacedSize {
	const layout = style.layout;
	const natural = content.intrinsic(style) ?? { width: 0, height: 0 };
	const ratio = layout.aspectRatio ?? (natural.width > 0 && natural.height > 0 ? natural.width / natural.height : null);
	const borderBox = layout.boxSizing === 'border-box';
	const definite = containingWidth !== null;
	const of = containingWidth ?? 0;
	const across = horizontalPadding(layout, of);
	const down = verticalPadding(layout, of);
	const heightOf = layout.height !== 'auto' && layout.height.percent === 0 ? contentSize(layout.height.px, down, borderBox) : null;
	const specifiedWidth =
		typeof layout.width === 'object' && (definite || !layout.width.percent)
			? contentSize(lengthPx(layout.width, of), across, borderBox)
			: null;
	let width = specifiedWidth ?? (heightOf !== null && ratio ? heightOf * ratio : natural.width);
	let height = heightOf ?? (specifiedWidth !== null && ratio ? specifiedWidth / ratio : natural.height);
	if (specifiedWidth === null && heightOf === null && layout.aspectRatio) height = width / layout.aspectRatio;
	const maxWidth =
		layout.maxWidth === 'none' || (!definite && layout.maxWidth.percent)
			? Infinity
			: contentSize(lengthPx(layout.maxWidth, of), across, borderBox);
	const minWidth =
		layout.minWidth === 'auto' || (!definite && layout.minWidth.percent)
			? 0
			: contentSize(lengthPx(layout.minWidth, of), across, borderBox);
	const keepsRatio = heightOf === null && ratio !== null;
	const clampedWidth = Math.max(minWidth, Math.min(width, maxWidth));
	if (clampedWidth !== width && keepsRatio) height = clampedWidth / ratio;
	width = clampedWidth;
	const maxHeight = layout.maxHeight === 'none' || layout.maxHeight.percent ? Infinity : contentSize(layout.maxHeight.px, down, borderBox);
	const minHeight = layout.minHeight === 'auto' || layout.minHeight.percent ? 0 : contentSize(layout.minHeight.px, down, borderBox);
	const clampedHeight = Math.max(minHeight, Math.min(height, maxHeight));
	if (clampedHeight !== height && specifiedWidth === null && ratio !== null) width = clampedHeight * ratio;
	height = clampedHeight;
	return { width, height, baseline: natural.baseline ?? height };
}
