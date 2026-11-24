// line boxes as Chromium stacks them (CSS 2.2 10.8 in LayoutNG)
import type { LineBox, LineFragment } from '../../contracts/layoutTypes';
import type { LayoutStyle, RunStyle, VerticalAlign } from '../../contracts/styleTypes';
import type { FontMetricsReader } from '../text/fontMetrics';
import { canvasFontOf } from '../text/fontStrings';
import type { PlacedLine } from './inlineFragments';

export type LineStackRequest = {
	/** the block's style: its font and line height make the strut */
	readonly style: LayoutStyle;
	readonly metrics: FontMetricsReader;
	/** device pixels per CSS px (DPR times zoom) */
	readonly pixelRatio: number;
	readonly spaceWidth: number;
};

type InlineExtent = { ascent: number; descent: number; align: 'top' | 'bottom' | null };

const LAYOUT_UNITS = 64;

/** Blink's LayoutUnit: 1/64 px, truncated */
export function layoutUnit(value: number): number {
	return Math.floor(value * LAYOUT_UNITS + 1e-6) / LAYOUT_UNITS;
}

function floorToDevice(value: number, ratio: number): number {
	return Math.floor(value * ratio + 1e-6) / ratio;
}

/** Blink takes a unitless line height against the size rounded to 1/64 px: computed 27.991px at 17.072px is 28 (P0) */
export function usedLineHeight(lineHeight: number | 'normal', fontSize: number, ascent: number, descent: number): number {
	if (lineHeight === 'normal' || fontSize <= 0) return ascent + descent;
	const roundedSize = Math.round(fontSize * LAYOUT_UNITS) / LAYOUT_UNITS;
	return layoutUnit((lineHeight / fontSize) * roundedSize);
}

function raiseOf(align: VerticalAlign, parentSize: number, lineHeight: number): number {
	if (typeof align === 'object') return align.px + (align.percent / 100) * lineHeight;
	// Blink's InlineBoxState: a third of the parent's font size up plus one, a fifth down plus one
	if (align === 'super') return parentSize / 3 + 1;
	if (align === 'sub') return -(parentSize / 5 + 1);
	return 0;
}

export function stackLines(lines: readonly PlacedLine[], request: LineStackRequest, top: number): { boxes: LineBox[]; bottom: number } {
	const { style, metrics, pixelRatio } = request;
	const strutFont = canvasFontOf(style.font);
	const strutMetrics = metrics(strutFont);
	const strut = inlineBox(
		strutMetrics.ascent,
		strutMetrics.descent,
		usedLineHeight(style.lineHeight, style.font.sizePx, strutMetrics.ascent, strutMetrics.descent)
	);

	function inlineBox(ascent: number, descent: number, lineHeight: number): InlineExtent {
		const leading = lineHeight - (ascent + descent);
		const above = floorToDevice(leading / 2, pixelRatio);
		return { ascent: ascent + above, descent: lineHeight - ascent - above, align: null };
	}
	function aligned(extent: InlineExtent, align: VerticalAlign, lineHeight: number, own: { ascent: number; descent: number }): InlineExtent {
		if (align === 'top' || align === 'bottom') return { ...extent, align };
		let raise = raiseOf(align, style.font.sizePx, lineHeight);
		if (align === 'text-top') raise = strutMetrics.ascent - own.ascent;
		else if (align === 'text-bottom') raise = own.descent - strutMetrics.descent;
		else if (align === 'middle') raise = style.font.sizePx / 4 - (extent.ascent - extent.descent) / 2;
		return { ascent: extent.ascent + raise, descent: extent.descent - raise, align: null };
	}
	function extentOf(fragment: LineFragment): InlineExtent | null {
		if (fragment.kind === 'atomic') {
			const align = fragment.box.style.layout.verticalAlign;
			const own = { ascent: fragment.ascent, descent: fragment.descent };
			return aligned({ ...own, align: null }, align, fragment.ascent + fragment.descent, own);
		}
		if (fragment.kind === 'widget') {
			if (!fragment.box) return null;
			const ascent = fragment.box.margin.top + (fragment.box.baselines?.last ?? fragment.box.height);
			return { ascent, descent: fragment.box.height + fragment.box.margin.top + fragment.box.margin.bottom - ascent, align: null };
		}
		const run = fragment.kind === 'generated' ? null : fragment.run;
		const font = run ? run.font : fragment.kind === 'generated' ? fragment.style.layout.font : style.font;
		const own = metrics(run ? run.fontString : canvasFontOf(font));
		const lineHeight = run
			? (run.lineHeight ?? 'normal')
			: fragment.kind === 'generated'
				? fragment.style.layout.lineHeight
				: style.lineHeight;
		const used = usedLineHeight(lineHeight, font.sizePx, own.ascent, own.descent);
		const align = run ? run.verticalAlign : fragment.kind === 'generated' ? fragment.style.layout.verticalAlign : 'baseline';
		return aligned(inlineBox(own.ascent, own.descent, used), align, used, own);
	}

	const boxes: LineBox[] = [];
	let y = top;
	lines.forEach((line, index) => {
		if (line.own === 'block' && lines[index - 1]?.own === 'block') y -= marginOverlap(lines[index - 1], line);
		const extents = line.fragments
			.map((fragment) => (line.own === 'alone' ? { ...extentOf(fragment)!, align: 'top' as const } : extentOf(fragment)))
			.filter((extent) => extent !== null);
		// a block-level object between lines stands without the strut, as an anonymous block would
		const inFlow = line.own === 'block' ? extents : [strut, ...extents];
		let ascent = Math.max(...inFlow.map((extent) => (extent.align ? -Infinity : extent.ascent)));
		let descent = Math.max(...inFlow.map((extent) => (extent.align ? -Infinity : extent.descent)));
		if (!Number.isFinite(ascent)) [ascent, descent] = [0, 0];
		for (const extent of inFlow) {
			const height = extent.ascent + extent.descent;
			if (extent.align === 'top' && height > ascent + descent) descent = height - ascent;
			if (extent.align === 'bottom' && height > ascent + descent) ascent = height - descent;
		}
		const height = layoutUnit(ascent) + layoutUnit(descent);
		const baseline = y + layoutUnit(ascent);
		boxes.push({
			y,
			height,
			baseline,
			textTop: baseline - strutMetrics.ascent,
			textBottom: baseline + strutMetrics.descent,
			from: line.from,
			to: line.to,
			fragments: line.fragments,
			hyphen: line.hyphen,
			// a justified line already reaches the column's edge: a range past it stops there
			endExtension: index < lines.length - 1 && line.justified !== true ? request.spaceWidth : 0,
			justified: line.justified === true
		});
		y += height;
	});
	return { boxes, bottom: y };
}

function blockBoxOf(line: PlacedLine): { margin: { top: number; bottom: number } } | null {
	const fragment = line.fragments[0];
	return fragment?.kind === 'atomic' ? fragment.box : null;
}

/** two blocks in a row between lines collapse the margins they meet at, as the anonymous block holding them does */
function marginOverlap(above: PlacedLine, below: PlacedLine): number {
	const a = blockBoxOf(above)?.margin.bottom ?? 0;
	const b = blockBoxOf(below)?.margin.top ?? 0;
	const collapsed = a >= 0 && b >= 0 ? Math.max(a, b) : a < 0 && b < 0 ? Math.min(a, b) : a + b;
	return a + b - collapsed;
}

/** px down from the line's baseline to a text run's own: vertical-align's raise and a relative shift (sup and sub) */
export function runBaselineOffset(run: RunStyle, style: LayoutStyle, metrics: FontMetricsReader): number {
	const shift = run.shift ?? 0;
	const align = run.verticalAlign;
	if (align === 'baseline' || align === 'top' || align === 'bottom') return shift;
	const own = metrics(run.fontString);
	const strut = metrics(canvasFontOf(style.font));
	const used = usedLineHeight(run.lineHeight ?? 'normal', run.font.sizePx, own.ascent, own.descent);
	let raise = raiseOf(align, style.font.sizePx, used);
	if (align === 'text-top') raise = strut.ascent - own.ascent;
	else if (align === 'text-bottom') raise = own.descent - strut.descent;
	else if (align === 'middle') raise = style.font.sizePx / 4 - (own.ascent - own.descent) / 2;
	return shift - raise;
}

export function isBlockLevel(style: LayoutStyle): boolean {
	return !style.display.startsWith('inline') && style.display !== 'none' && style.display !== 'contents';
}
