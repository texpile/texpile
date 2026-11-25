// CSS 2.2 8.3.1 margin collapsing
import type { LayoutStyle } from '../contracts/styleTypes';

/** margins that adjoin, kept apart by sign until they are resolved */
export type CollapsedMargin = { readonly positive: number; readonly negative: number };

export const NO_MARGIN: CollapsedMargin = { positive: 0, negative: 0 };

export function marginOf(value: number): CollapsedMargin {
	return { positive: Math.max(0, value), negative: Math.min(0, value) };
}

export function adjoin(one: CollapsedMargin, two: CollapsedMargin): CollapsedMargin {
	return { positive: Math.max(one.positive, two.positive), negative: Math.min(one.negative, two.negative) };
}

export function resolveMargin(margin: CollapsedMargin): number {
	return margin.positive + margin.negative;
}

/** a box that lays its children out in a formatting context of its own keeps its margins apart from theirs */
export function startsFormattingContext(style: LayoutStyle): boolean {
	const { display, overflowX, overflowY, float, position } = style;
	if (float !== 'none' || position === 'absolute') return true;
	if (display !== 'block' && display !== 'list-item') return true;
	return overflowX !== 'visible' || overflowY !== 'visible' || style.columns.count !== null;
}

/** the parent's top margin adjoins its first child's */
export function collapsesWithFirstChild(style: LayoutStyle): boolean {
	return !startsFormattingContext(style) && style.borderWidth.top === 0 && style.padding.top.px === 0 && style.padding.top.percent === 0;
}

/** the parent's bottom margin adjoins its last child's while its height comes from its content */
export function collapsesWithLastChild(style: LayoutStyle): boolean {
	return (
		!startsFormattingContext(style) &&
		style.borderWidth.bottom === 0 &&
		style.padding.bottom.px === 0 &&
		style.padding.bottom.percent === 0 &&
		style.height === 'auto' &&
		(style.minHeight === 'auto' || (style.minHeight.px === 0 && style.minHeight.percent === 0))
	);
}
