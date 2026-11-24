// inline content as boxes, glue and penalties for knuthPlass.ts, as paragraphItems.ts built them from the DOM (5.3)
import { breakOpportunities } from '../linebreak/breakOpportunities';
import type { LineItem } from '../linebreak/knuthPlass';
import type { Hyphenator } from '../linebreak/liangHyphenation';
import { graphemeBoundaries } from '../text/graphemes';
import type { InlinePiece } from './inlineContent';

export type BreakSiteKind = 'break' | 'hyphen' | 'anywhere';
/** the characters a break is drawn on, as offsets from the textblock's position; inside struck words, the widget's own */
export type BreakSite = { from: number; to: number; kind: BreakSiteKind; inside?: { key: string; from: number; to: number } };

/** what a stretch of the composed text stands for: a piece's text, or the room its mark levels take at one end */
export type ComposedSpan = {
	readonly from: number;
	readonly to: number;
	readonly piece: number;
	readonly role: 'content' | 'edgeStart' | 'edgeEnd';
};

export type InlineItems = {
	/** the pieces as one string: an object is a letter, a forced break a newline */
	readonly text: string;
	readonly spans: readonly ComposedSpan[];
	readonly items: LineItem[];
	/** each item's composed range */
	readonly ranges: readonly (readonly [number, number])[];
	readonly sites: ReadonlyMap<number, BreakSite>;
	/** the boxes that are a preserved tab: as wide as the way to the next tab stop, known only on the line */
	readonly tabs: ReadonlySet<number>;
};

export type DocumentRange = { readonly from: number; readonly to: number };

export type InlineItemOptions = {
	readonly measureText: (piece: number, text: string) => number;
	/** an object's or generated content's room on the line */
	readonly widthOf: (piece: number) => number;
	readonly hyphenator: Hyphenator | null;
	/** words the patterns leave alone (the word being typed), offsets from the top-level block's start */
	readonly wholeWords: readonly DocumentRange[];
	/** text no line may end inside (an input method's preedit) */
	readonly unbroken: DocumentRange | null;
	/** a word wider than this may end a line after any of its characters, as the browser splits a word that fits no line */
	readonly splitWiderThan: number;
	/** D10: an inline node stands in the text as a letter; else CSS's wrap opportunity on both sides of an atomic inline */
	readonly held: boolean;
	/** the textblock's offset from the top-level block's start; sites count from it */
	readonly textblockOffset: number;
};

// plain TeX's \hyphenpenalty and \exhyphenpenalty
const HYPHEN_PENALTY = 50;
const EXPLICIT_HYPHEN_PENALTY = 50;
// a split inside a word costs about what a line stretched well past its spaces does, so a word that must split anyway
// fills the line before it rather than leave it gappy
const ANYWHERE_PENALTY = 200;
// stands in for infinite stretch, which sums cannot hold
const FILL = 1e6;
export const HYPHEN = '-';
const ONE_WORD = /^(\P{L}*)(\p{L}{5,})(\P{L}*)$/u;
// an inline node stands in the text as a letter, so a line ends beside it only at a space, as in TeX
const HELD_OBJECT = 'x';
const TAB = '\t';
const OBJECT = '￼';

const NO_BREAK: LineItem = { kind: 'penalty', width: 0, cost: Infinity, flagged: false, fromPatterns: false };
const WRAP_HERE: LineItem = { kind: 'penalty', width: 0, cost: 0, flagged: false, fromPatterns: false };
const END_OF_LINE: LineItem[] = [
	NO_BREAK,
	{ kind: 'glue', width: 0, stretch: FILL, shrink: 0 },
	{ kind: 'penalty', width: 0, cost: -Infinity, flagged: false, fromPatterns: false }
];

function patternCuts(token: string, hyphenator: Hyphenator): number[] {
	const parts = ONE_WORD.exec(token);
	if (!parts) return [];
	const word = parts[2].toLowerCase();
	// a letter whose lowercase form is longer would shift every offset after it
	if (word.length !== parts[2].length) return [];
	return hyphenator(word).map((point) => parts[1].length + point);
}

function spanAt(spans: readonly ComposedSpan[], index: number): ComposedSpan {
	let low = 0;
	let high = spans.length - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (spans[middle].from <= index) low = middle;
		else high = middle - 1;
	}
	return spans[low];
}

/** the offset from the top-level block's start of the boundary before composed index (text.length: the end) */
export function boundaryOffset(spans: readonly ComposedSpan[], pieces: readonly InlinePiece[], index: number): number {
	if (!spans.length) return 0;
	const last = spans.at(-1)!;
	const atEnd = index >= last.to;
	const span = atEnd ? last : spanAt(spans, index);
	const piece = pieces[span.piece];
	if (piece.kind === 'text') {
		if (span.role === 'edgeEnd' || (atEnd && span.role === 'content')) return piece.to;
		if (span.role === 'edgeStart' || piece.struck || piece.to === piece.from) return piece.from;
		return piece.from + index - span.from;
	}
	if (piece.kind === 'generated') return piece.at;
	return piece.at + (atEnd ? piece.size : 0);
}

function graphemeCuts(token: string): number[] {
	return graphemeBoundaries(token).slice(1, -1);
}

function composedSpans(pieces: readonly InlinePiece[], held: boolean): { text: string; spans: ComposedSpan[] } {
	let text = '';
	const spans: ComposedSpan[] = [];
	function add(piece: number, part: string, role: ComposedSpan['role']): void {
		spans.push({ from: text.length, to: text.length + part.length, piece, role });
		text += part;
	}
	pieces.forEach((piece, i) => {
		if (piece.kind === 'text') {
			if (piece.edgeStart > 0) add(i, HELD_OBJECT, 'edgeStart');
			add(i, piece.text, 'content');
			if (piece.edgeEnd > 0) add(i, HELD_OBJECT, 'edgeEnd');
		} else if (piece.kind === 'break') add(i, '\n', 'content');
		else add(i, piece.kind === 'object' && !held ? OBJECT : HELD_OBJECT, 'content');
	});
	return { text, spans };
}

export function inlineItems(pieces: readonly InlinePiece[], options: InlineItemOptions): InlineItems {
	const { measureText, widthOf, hyphenator, wholeWords, unbroken, splitWiderThan, held, textblockOffset } = options;
	const { text, spans } = composedSpans(pieces, held);
	const items: LineItem[] = [];
	const ranges: (readonly [number, number])[] = [];
	const sites = new Map<number, BreakSite>();
	const tabs = new Set<number>();
	let span = 0;

	function push(item: LineItem, from: number, to: number): void {
		items.push(item);
		ranges.push([from, to]);
	}
	function spanOf(index: number): ComposedSpan {
		while (span < spans.length - 1 && spans[span].to <= index) span++;
		while (span > 0 && spans[span].from > index) span--;
		return spans[span];
	}
	function contentOf(found: ComposedSpan): { at: number; struck: string | null } | null {
		const piece = pieces[found.piece];
		if (piece.kind === 'text' && found.role === 'content') return { at: piece.from, struck: piece.struck };
		return null;
	}
	/** the document offset of composed index, or the offset after it */
	function offsetOf(index: number, after: boolean): number {
		return after ? boundaryOffset(spans, pieces, index + 1) : boundaryOffset(spans, pieces, index);
	}
	// the characters from composed index `from` up to `to`, all in one span, as a site
	function siteOf(from: number, to: number, kind: BreakSiteKind): BreakSite {
		const found = spanOf(from);
		const piece = pieces[found.piece];
		if (piece.kind === 'text' && piece.struck && found.role === 'content')
			return {
				from: piece.from - textblockOffset,
				to: piece.from - textblockOffset,
				kind,
				inside: { key: piece.struck, from: from - found.from, to: to - found.from }
			};
		return { from: offsetOf(from, false) - textblockOffset, to: offsetOf(to - 1, true) - textblockOffset, kind };
	}
	function insideAny(ranges: readonly DocumentRange[], from: number, to: number): boolean {
		return ranges.some((range) => from < range.to && range.from < to);
	}

	// a hyphenation point is drawn on the letter before it; a split anywhere on the whole character before it
	function addWord(token: string, index: number, piece: number, cuts: number[], kind: 'hyphen' | 'anywhere'): void {
		let measured = 0;
		let last = 0;
		// a split anywhere is drawn as the pieces between its cuts, so each is measured alone
		function boxWidth(cut: number): number {
			if (kind === 'anywhere') return measureText(piece, token.slice(last, cut));
			const upTo = measureText(piece, token.slice(0, cut));
			const width = upTo - measured;
			measured = upTo;
			return width;
		}
		for (const cut of cuts) {
			push({ kind: 'box', width: boxWidth(cut) }, index + last, index + cut);
			sites.set(items.length, siteOf(index + (kind === 'hyphen' ? cut - 1 : last), index + cut, kind));
			push(
				kind === 'hyphen'
					? { kind: 'penalty', width: measureText(piece, HYPHEN), cost: HYPHEN_PENALTY, flagged: true, fromPatterns: true }
					: { kind: 'penalty', width: 0, cost: ANYWHERE_PENALTY, flagged: false, fromPatterns: false },
				index + cut,
				index + cut
			);
			last = cut;
		}
		push({ kind: 'box', width: boxWidth(token.length) }, index + last, index + token.length);
	}

	// tabs only reach greedy flows (breakProfiles.ts), which never hyphenate
	function addTabbed(token: string, index: number, piece: number): void {
		let at = 0;
		for (const part of token.split(/(\t)/)) {
			if (part === TAB) {
				tabs.add(items.length);
				push({ kind: 'box', width: 0 }, index + at, index + at + 1);
			} else if (part) addWord(part, index + at, piece, [], 'hyphen');
			at += part.length;
		}
	}

	// TeX hyphenates a word that follows glue, so one that follows a hyphen or a dash is left as it is; struck words
	// are neither hyphenated nor split
	function addBoxes(from: number, to: number, hyphenatable: boolean): void {
		for (let index = from; index < to;) {
			const found = spanOf(index);
			const end = Math.min(to, found.to);
			const piece = pieces[found.piece];
			if (piece.kind !== 'object' || held) {
				const content = contentOf(found);
				if (!content) push({ kind: 'box', width: widthOfSpan(found) }, index, end);
				else if (text.slice(index, end).includes(TAB)) addTabbed(text.slice(index, end), index, found.piece);
				else {
					const token = text.slice(index, end);
					const docFrom = offsetOf(index, false);
					const docTo = offsetOf(end - 1, true);
					const whole = insideAny(wholeWords, docFrom, docTo) || (unbroken !== null && insideAny([unbroken], docFrom, docTo));
					if (!content.struck && !whole && measureText(found.piece, token) > splitWiderThan)
						addWord(token, index, found.piece, graphemeCuts(token), 'anywhere');
					else {
						const oneWord = hyphenatable && hyphenator !== null && !whole && !content.struck && index === from && end === to;
						addWord(token, index, found.piece, oneWord ? patternCuts(token, hyphenator) : [], 'hyphen');
					}
				}
			} else {
				// CSS: a soft wrap opportunity before and after every atomic inline
				if (items.length && items.at(-1)!.kind === 'box') push(WRAP_HERE, index, index);
				push({ kind: 'box', width: widthOf(found.piece) }, index, end);
				push(WRAP_HERE, end, end);
			}
			index = end;
		}
	}
	function widthOfSpan(found: ComposedSpan): number {
		const piece = pieces[found.piece];
		if (piece.kind === 'text') return found.role === 'edgeStart' ? piece.edgeStart : piece.edgeEnd;
		return piece.kind === 'break' ? 0 : widthOf(found.piece);
	}

	// spaces across a change of runs end a line together; the site goes on the last run's share of them
	function addSpaces(from: number, to: number): void {
		let width = 0;
		let lastFrom = from;
		for (let i = from; i < to;) {
			const found = spanOf(i);
			const end = Math.min(to, found.to);
			if (contentOf(found)) width += measureText(found.piece, text.slice(i, end));
			lastFrom = i;
			i = end;
		}
		sites.set(items.length, siteOf(lastFrom, to, 'break'));
		push({ kind: 'glue', width, stretch: width / 2, shrink: 0 }, from, to);
	}

	// a break with no space to mark is drawn on the character before it; false when that is the room beside a run,
	// which is no character of the text
	function siteBefore(at: number): boolean {
		const site = siteOf(at - 1, at, 'break');
		if (site.to <= site.from && !site.inside) return false;
		sites.set(items.length, site);
		return true;
	}
	function halfSpace(index: number): number {
		const found = spanOf(index);
		return contentOf(found) ? measureText(found.piece, ' ') / 2 : 0;
	}
	function breakInsideUnbroken(at: number): boolean {
		if (!unbroken || at <= 0 || at >= text.length) return false;
		const docAt = offsetOf(at, false);
		return docAt > unbroken.from && docAt < unbroken.to;
	}

	let start = 0;
	let hyphenatable = true;
	for (const { at, dropFrom, kind } of breakOpportunities(text)) {
		if (kind !== 'required' && kind !== 'end' && breakInsideUnbroken(at)) continue;
		addBoxes(start, dropFrom, hyphenatable);
		const spacesTo = kind === 'required' ? at - 1 : at;
		if (dropFrom < spacesTo) addSpaces(dropFrom, spacesTo);
		if (kind === 'end' || kind === 'required') {
			if (kind === 'required') sites.set(items.length + 2, siteOf(at - 1, at, 'break'));
			for (const item of END_OF_LINE) push(item, spacesTo, kind === 'required' ? at : spacesTo);
		} else if (kind === 'ideographic') {
			if (siteBefore(at)) push({ kind: 'glue', width: 0, stretch: halfSpace(at - 1), shrink: 0 }, at, at);
		} else if (kind === 'word') {
			if (siteBefore(at)) push({ kind: 'penalty', width: 0, cost: 0, flagged: false, fromPatterns: false }, at, at);
		} else if (kind === 'joint' && text[at - 1] !== OBJECT && text[at] !== OBJECT) {
			if (siteBefore(at)) push({ kind: 'penalty', width: 0, cost: EXPLICIT_HYPHEN_PENALTY, flagged: true, fromPatterns: false }, at, at);
		}
		hyphenatable = kind !== 'joint';
		start = at;
	}
	return { text, spans, items, ranges, sites, tabs };
}
