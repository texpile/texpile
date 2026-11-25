// a broken flow's lines as fragments in visual order, justified as Chromium justifies
import type { LayoutBoxBuilder, LineFragment } from '../../contracts/layoutTypes';
import type { LayoutStyle, RunStyle } from '../../contracts/styleTypes';
import { bidiLevels, levelRuns, visualOrder } from '../text/bidiRuns';
import type { BreakProfile } from './breakProfiles';
import type { InlinePiece } from './inlineContent';
import { boundaryOffset, type ComposedSpan } from './inlineItems';
import { isForcedBreak, type ChosenLines, type LineWidths } from './lineBreaking';
import { transformedText } from './whiteSpace';

/** an object or generated piece laid out before the lines: its margin box on the line */
export type PlacedObject = {
	readonly box: LayoutBoxBuilder | null;
	readonly width: number;
	readonly ascent: number;
	readonly descent: number;
};

export type PlacedLine = {
	readonly fragments: LineFragment[];
	readonly hyphen: LineFragment | null;
	readonly from: number;
	readonly to: number;
	/** ended by a hard break or the flow's end */
	readonly forced: boolean;
	/** its spaces were stretched to the measure */
	readonly justified?: boolean;
	/** a block-level object on a line of its own, or a line chip alone in its paragraph (blockInInline.ts) */
	readonly own?: 'block' | 'alone';
};

export type FragmentRequest = {
	readonly chosen: ChosenLines;
	readonly pieces: readonly InlinePiece[];
	readonly objects: ReadonlyMap<number, PlacedObject>;
	readonly measureText: (piece: number, text: string) => number;
	readonly profile: BreakProfile;
	readonly style: LayoutStyle;
	readonly widths: LineWidths;
	/** x of each line's start in the content box: the indent, room left by a float */
	readonly lineLeft: (line: number) => number;
	/** where an empty flow's caret stop is, from the top-level block's start */
	readonly emptyAt: number;
	/** a preserved tab's advance at x from the content box's start edge */
	readonly tabAdvance: (x: number) => number;
};

type PartRole = 'box' | 'glue' | 'hung';
// gap: a justified line spreads room after this part (between two ideographs); members: the parts a merged word was made of
type LinePart = { fragment: LineFragment; role: PartRole; spaces: number; level: number; tab: boolean; gap: boolean; members?: LinePart[] };

const NBSP = ' ';
const TAB = '\t';
const OBJECT_CHARACTER = '￼';

function spaceCount(text: string): number {
	let count = 0;
	for (const char of text) if (char === ' ' || char === NBSP) count++;
	return count;
}

function textFragment(piece: InlinePiece & { kind: 'text' }, slice: string, offset: number, width: number, level: number): LineFragment {
	const text = transformedText(slice, piece.run.textTransform) ?? slice;
	if (piece.struck) return { kind: 'struck', x: 0, width, text, run: piece.run, widget: piece.struck, at: piece.from };
	const from = piece.to > piece.from ? piece.from + offset : piece.from;
	const to = piece.to > piece.from ? from + slice.length : piece.from;
	return { kind: 'text', x: 0, width, text, run: piece.run, from, to, level, advances: null };
}

export function placeLineFragments(request: FragmentRequest): PlacedLine[] {
	const { chosen, pieces, objects, measureText, profile, style } = request;
	const { items, ranges, spans, text } = chosen.items;
	const levels = bidiLevels(bidiText(text, spans, pieces), style.direction);
	const lines: PlacedLine[] = [];

	function partsOf(from: number, to: number, role: PartRole): LinePart[] {
		const found: LinePart[] = [];
		for (let i = firstSpanAfter(spans, from); i < spans.length && spans[i].from < to; i++) {
			const span = spans[i];
			for (const run of levelRuns(levels, Math.max(from, span.from), Math.min(to, span.to)))
				found.push(...spanParts(span, run.from, run.to, run.level, role));
		}
		return found;
	}
	function spanParts(span: ComposedSpan, from: number, to: number, level: number, role: PartRole): LinePart[] {
		const piece = pieces[span.piece];
		if (piece.kind === 'text') {
			if (span.role !== 'content') {
				const width = span.role === 'edgeStart' ? piece.edgeStart : piece.edgeEnd;
				const side = span.role === 'edgeStart' ? 'start' : 'end';
				return [{ fragment: { kind: 'edge', x: 0, width, run: piece.run, side }, role, spaces: 0, level, tab: false, gap: false }];
			}
			const parts: LinePart[] = [];
			// Chromium spreads a justified line over its no-break spaces too; a tab takes its width on the line
			const apart = role === 'box' && profile.justified ? NBSP + TAB : TAB;
			for (const [a, b] of cutsAround(piece.text, from - span.from, to - span.from, apart)) {
				const slice = piece.text.slice(a, b);
				const tab = slice === TAB;
				const spread = !tab && (role !== 'box' || slice === NBSP);
				const fragment = textFragment(piece, slice, a, tab ? 0 : measureText(span.piece, slice), level);
				parts.push({
					fragment,
					role: spread && role === 'box' ? 'glue' : role,
					spaces: spread ? spaceCount(slice) : 0,
					level,
					tab,
					gap: false
				});
			}
			return parts;
		}
		if (piece.kind === 'break') return [];
		const placed = objects.get(span.piece);
		const width = placed?.width ?? 0;
		if (piece.kind === 'generated')
			return [
				{
					fragment: { kind: 'generated', x: 0, width, text: piece.text, style: piece.style },
					role,
					spaces: 0,
					level,
					tab: false,
					gap: false
				}
			];
		if (piece.side !== null)
			return [
				{
					fragment: { kind: 'widget', x: 0, width, box: placed?.box ?? null, at: piece.at, side: piece.side },
					role,
					spaces: 0,
					level,
					tab: false,
					gap: false
				}
			];
		const box = placed?.box;
		if (!box) return [];
		const atomic: LineFragment = {
			kind: 'atomic',
			x: 0,
			width,
			ascent: placed.ascent,
			descent: placed.descent,
			box,
			from: piece.at,
			to: piece.at + piece.size
		};
		return [{ fragment: atomic, role, spaces: 0, level, tab: false, gap: false }];
	}

	let start = 0;
	chosen.breaks.forEach((end, index) => {
		const parts: LinePart[] = [];
		let expansions = 0;
		for (let i = start; i < end; i++) {
			const item = items[i];
			const [from, to] = ranges[i];
			if (item.kind === 'box') parts.push(...partsOf(from, to, 'box'));
			else if (item.kind === 'glue' && to > from) parts.push(...partsOf(from, to, i === start ? 'box' : 'glue'));
			else if (item.kind === 'glue' && item.stretch > 0 && item.stretch < 1e5 && parts.length) {
				parts[parts.length - 1].gap = true;
				expansions++;
			}
		}
		const breakItem = items[end];
		const [breakFrom, breakTo] = ranges[end];
		let hyphen: LineFragment | null = null;
		if (breakItem.kind === 'glue') parts.push(...partsOf(breakFrom, breakTo, 'hung'));
		else if (breakItem.kind === 'penalty' && breakItem.flagged && breakItem.width > 0) {
			const run = runBefore(parts);
			if (run) hyphen = { kind: 'hyphen', x: 0, width: breakItem.width, run, at: breakFrom };
		}
		const merged = mergeWords(parts);
		const forced = isForcedBreak(breakItem);
		lines.push(alignLine(merged, hyphen, index, forced, expansions, lineRange(start, end)));
		start = end + 1;
	});

	function lineRange(from: number, to: number): { from: number; to: number } {
		if (!spans.length) return { from: request.emptyAt, to: request.emptyAt };
		return { from: boundaryOffset(spans, pieces, ranges[from][0]), to: boundaryOffset(spans, pieces, ranges[to][1]) };
	}

	function alignLine(
		parts: LinePart[],
		hyphen: LineFragment | null,
		index: number,
		forced: boolean,
		expansions: number,
		range: { from: number; to: number }
	): PlacedLine {
		const available = index === 0 ? request.widths.first : request.widths.rest;
		const content = parts.filter((part) => part.role !== 'hung');
		sizeTabs(content, request.lineLeft(index), request.tabAdvance);
		const natural = content.reduce((sum, part) => sum + part.fragment.width, 0) + (hyphen?.width ?? 0);
		const opportunities = content.reduce((sum, part) => sum + part.spaces, 0) + expansions;
		const justify = profile.justified && !forced && opportunities > 0 && available > natural;
		const perOpportunity = justify ? (available - natural) / opportunities : 0;
		const spread = justify ? content.flatMap((part) => spreadPart(part, perOpportunity)) : content;
		const ordered = levels ? visualOrder(spread, (part) => part.level) : spread;
		const room = available - natural - (justify ? opportunities * perOpportunity : 0);
		let x = request.lineLeft(index) + startOffset(style, room, justify);
		const fragments: LineFragment[] = [];
		for (const part of ordered) {
			part.fragment.x = x;
			x += part.fragment.width;
			fragments.push(part.fragment);
		}
		const placedHyphen = hyphen ? { ...hyphen, x } : null;
		if (placedHyphen) {
			x += placedHyphen.width;
			fragments.push(placedHyphen);
		}
		for (const part of parts) {
			if (part.role !== 'hung') continue;
			part.fragment.x = x;
			x += part.fragment.width;
			fragments.push(part.fragment);
		}
		return { fragments, hyphen: placedHyphen, from: range.from, to: range.to, forced, justified: justify };
	}

	return lines;
}

/** tab stops count from the content box's start edge, in logical order before the line is aligned */
function sizeTabs(parts: readonly LinePart[], lineLeft: number, tabAdvance: (x: number) => number): void {
	let x = lineLeft;
	for (const part of parts) {
		if (part.tab) part.fragment.width = tabAdvance(x);
		x += part.fragment.width;
	}
}

function runBefore(parts: readonly LinePart[]): RunStyle | null {
	for (let i = parts.length - 1; i >= 0; i--) {
		const fragment = parts[i].fragment;
		if (fragment.kind === 'text' || fragment.kind === 'struck') return fragment.run;
	}
	return null;
}

// a word split at its hyphenation points is one fillText again unless the line ends inside it
function mergeWords(parts: LinePart[]): LinePart[] {
	const merged: LinePart[] = [];
	for (const part of parts) {
		const last = merged.at(-1);
		const one = last?.fragment;
		const two = part.fragment;
		if (
			last &&
			last.role === 'box' &&
			!last.tab &&
			!part.tab &&
			part.role === 'box' &&
			last.level === part.level &&
			one?.kind === 'text' &&
			two.kind === 'text' &&
			one.run === two.run &&
			one.to === two.from &&
			two.to > two.from
		) {
			last.members ??= [{ ...last }];
			last.members.push(part);
			last.fragment = { ...one, text: one.text + two.text, width: one.width + two.width, to: two.to };
			last.gap = part.gap;
			continue;
		}
		merged.push(part);
	}
	return merged;
}

/** a part with the justified line's room added: after each space, and after each ideograph a merged word was made of */
function spreadPart(part: LinePart, perOpportunity: number): LinePart[] {
	const members = part.members ?? [part];
	if (members.every((member) => !member.gap || member === members.at(-1))) {
		const { fragment } = part;
		if (part.spaces) fragment.width += part.spaces * perOpportunity;
		if (part.gap) fragment.width += perOpportunity;
		return [part];
	}
	const words: LinePart[] = [];
	let first = 0;
	members.forEach((member, i) => {
		if (!member.gap && i < members.length - 1) return;
		const group = members.slice(first, i + 1);
		first = i + 1;
		const fragments = group.map((one) => one.fragment);
		const one = fragments[0] as LineFragment & { kind: 'text' };
		const two = fragments.at(-1) as LineFragment & { kind: 'text' };
		const width = fragments.reduce((sum, fragment) => sum + fragment.width, 0) + (member.gap ? perOpportunity : 0);
		words.push({
			...member,
			fragment: { ...one, text: fragments.map((f) => (f as typeof one).text).join(''), width, to: two.to },
			members: undefined
		});
	});
	return words;
}

function startOffset(style: LayoutStyle, room: number, justified: boolean): number {
	if (justified || room <= 0) return style.direction === 'rtl' && !justified ? room : 0;
	const align = style.textAlign;
	if (align === 'center') return room / 2;
	const toRight =
		align === 'right' ||
		(align === 'end' && style.direction === 'ltr') ||
		((align === 'start' || align === 'justify') && style.direction === 'rtl');
	return toRight ? room : 0;
}

/** the composed text for UAX #9: an object is a neutral U+FFFC, which a held flow writes as a letter */
function bidiText(text: string, spans: readonly ComposedSpan[], pieces: readonly InlinePiece[]): string {
	let found = '';
	for (const span of spans) {
		const piece = pieces[span.piece];
		found +=
			piece.kind === 'text' && span.role === 'content'
				? text.slice(span.from, span.to)
				: text.slice(span.from, span.to).replace(/./gu, OBJECT_CHARACTER);
	}
	return found;
}

/** the index of the first span ending after composed index `from`, or spans.length */
function firstSpanAfter(spans: readonly ComposedSpan[], from: number): number {
	let low = 0;
	let high = spans.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (spans[middle].to <= from) low = middle + 1;
		else high = middle;
	}
	return low;
}

/** [from, to) pieces of a word with each of the characters on its own */
function cutsAround(text: string, from: number, to: number, characters: string): [number, number][] {
	const cuts: [number, number][] = [];
	let start = from;
	for (let i = from; i < to; i++) {
		if (!characters.includes(text[i])) continue;
		if (i > start) cuts.push([start, i]);
		cuts.push([i, i + 1]);
		start = i + 1;
	}
	if (start < to) cuts.push([start, to]);
	return cuts;
}
