// where a position sits on a line and the stop nearest an x: per grapheme advances, text-transform and justification
import type { Node as PMNode } from 'prosemirror-model';
import type { LineBox, LineFragment, TextMeasure } from '../contracts/layoutTypes';
import { measureRun } from '../layout/inline/inlineFlow';
import { graphemeBoundaries } from '../layout/text/graphemes';
import { hasPositions, lineEnd, lineStartX, type PlacedTextblock } from './lineIndex';

export type TextFragment = LineFragment & { kind: 'text' };
/** -1: a position between two fragments takes the earlier's end; 1: the later's start */
export type FragmentSide = -1 | 1;

const SPACE = /[ \u00a0]/g;

/** the fragment's source text: the drawn text may be transformed */
export function sourceOf(fragment: TextFragment, top: PMNode): string {
	return top.textBetween(fragment.from - 1, fragment.to - 1);
}

/** the x of every offset from the fragment's logical start, a grapheme's inside taking its start; filled once */
export function advancesOf(fragment: TextFragment, top: PMNode, measure: TextMeasure): Float32Array {
	if (fragment.advances) return fragment.advances;
	const source = sourceOf(fragment, top);
	const advances = new Float32Array(source.length + 1);
	const boundaries = graphemeBoundaries(source);
	const natural = measureRun(measure, fragment.run, source);
	const spaces = source.match(SPACE)?.length ?? 0;
	const extra = fragment.width - natural;
	const perSpace = spaces && Math.abs(extra) > 0.01 ? extra / spaces : 0;
	const scale = !spaces && natural > 0 && Math.abs(extra) > 0.01 ? fragment.width / natural : 1;
	let next = 0;
	let spread = 0;
	for (let offset = 0; offset <= source.length; offset++) {
		if (offset === boundaries[next]) {
			next++;
			advances[offset] = (offset === source.length ? natural : measureRun(measure, fragment.run, source.slice(0, offset))) * scale + spread;
		} else advances[offset] = advances[offset - 1];
		if (offset < source.length && (source[offset] === ' ' || source[offset] === '\u00a0')) spread += perSpace;
	}
	advances[source.length] = fragment.width;
	// eslint-disable-next-line no-param-reassign -- the layout leaves advances to the first caret question
	fragment.advances = advances;
	return advances;
}

/** x on the line of an offset inside a text fragment */
export function textX(fragment: TextFragment, offset: number, top: PMNode, measure: TextMeasure): number {
	const at = offset - fragment.from;
	const advance = at <= 0 ? 0 : offset >= fragment.to ? fragment.width : advancesOf(fragment, top, measure)[at];
	return fragment.level % 2 === 1 ? fragment.x + fragment.width - advance : fragment.x + advance;
}

/** the fragment the offset sits in, preferring the one that ends at it (side -1) or starts at it (side 1) */
export function fragmentAt(line: LineBox, offset: number, side: FragmentSide): (LineFragment & { kind: 'text' | 'atomic' }) | null {
	let ending: (LineFragment & { kind: 'text' | 'atomic' }) | null = null;
	let starting: (LineFragment & { kind: 'text' | 'atomic' }) | null = null;
	for (const fragment of line.fragments) {
		if (!hasPositions(fragment) || offset < fragment.from || offset > fragment.to) continue;
		if (offset > fragment.from && offset < fragment.to) return fragment;
		if (offset === fragment.to && fragment.to > fragment.from) ending ??= fragment;
		if (offset === fragment.from) starting ??= fragment;
	}
	return side < 0 ? (ending ?? starting) : (starting ?? ending);
}

/** x on the line, relative to the textblock's border box, of an offset the line holds */
export function lineX(
	textblock: PlacedTextblock,
	index: number,
	offset: number,
	side: FragmentSide,
	tools: { top: PMNode; measure: TextMeasure }
): number {
	const line = textblock.lines[index];
	const fragment = fragmentAt(line, offset, side);
	if (!fragment) {
		const leading = line.fragments.findIndex(hasPositions);
		const before = leading < 0 ? line.fragments.filter((f) => f.kind === 'generated') : line.fragments.slice(0, leading);
		return before.length ? Math.max(...before.map((f) => f.x + f.width)) : lineStartX(textblock, index);
	}
	if (fragment.kind === 'atomic') {
		const after = offset === fragment.to && fragment.to > fragment.from;
		return after !== isRtlAtomic(line, fragment) ? fragment.x + fragment.width : fragment.x;
	}
	return textX(fragment, offset, tools.top, tools.measure);
}

/** an atom between right-to-left neighbours sits mirrored */
function isRtlAtomic(line: LineBox, fragment: LineFragment): boolean {
	const index = line.fragments.indexOf(fragment);
	const neighbour = [line.fragments[index - 1], line.fragments[index + 1]].find((f) => f?.kind === 'text');
	return neighbour?.kind === 'text' && neighbour.level % 2 === 1;
}

/** the caret stop nearest x on the line: a point in a grapheme's far half takes the stop after it */
export function offsetNearX(
	textblock: PlacedTextblock,
	index: number,
	x: number,
	stops: readonly number[],
	tools: { top: PMNode; measure: TextMeasure }
): number {
	const line = textblock.lines[index];
	const end = lineEnd(line);
	const onLine = stops.filter((stop) => stop >= line.from && stop <= end);
	if (!onLine.length) return line.from;
	let best = onLine[0];
	let distance = Infinity;
	for (const fragment of line.fragments) {
		if (!hasPositions(fragment)) continue;
		if (x < fragment.x || x > fragment.x + fragment.width) continue;
		const inside = onLine.filter((stop) => stop >= fragment.from && stop <= fragment.to);
		for (const stop of inside) {
			const at =
				fragment.kind === 'atomic'
					? stop === fragment.from
						? fragment.x
						: fragment.x + fragment.width
					: textX(fragment, stop, tools.top, tools.measure);
			const gap = Math.abs(at - x);
			if (gap < distance) [best, distance] = [stop, gap];
		}
		if (distance < Infinity) return best;
	}
	for (const stop of onLine) {
		const gap = Math.abs(lineX(textblock, index, stop, stop === end ? -1 : 1, tools) - x);
		if (gap < distance) [best, distance] = [stop, gap];
	}
	return best;
}
