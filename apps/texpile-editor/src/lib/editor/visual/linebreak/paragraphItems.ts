// a paragraph of the visual editor as boxes, glue and penalties for the line breaker
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { breakOpportunities } from './breakOpportunities';
import type { LineItem } from './knuthPlass';
import type { Hyphenator } from './liangHyphenation';
import type { StruckWords } from './struckWords';
import type { RunStyleReader, TextRunStyle } from './textRunStyles';
import type { TypedWord } from './wordBeingTyped';
import { textWidth } from './wordWidths';

/** break: a space or a character a line may end after. hyphen: a hyphenation point. anywhere: inside a word too wide for a line */
export type BreakMarkKind = 'break' | 'hyphen' | 'anywhere';
/**
 * the characters a break at some item is drawn on, as offsets from the paragraph's own position. A break inside a
 * suggestion's struck words sits at the words' position and names the characters inside them
 */
export type BreakMark = { from: number; to: number; kind: BreakMarkKind; inside?: { key: string; from: number; to: number } };
export type ParagraphItems = { items: LineItem[]; marks: Map<number, BreakMark> };

export type ParagraphMeasures = {
	styleOf: RunStyleReader;
	/** null leaves words whole */
	hyphenator: Hyphenator | null;
	/** the room an inline node view takes on a line */
	inlineWidthOf(dom: HTMLElement): number;
	/** document positions of a word the patterns must leave alone */
	wholeWord: TypedWord | null;
	/** a word wider than this may end a line after any of its characters, as the browser splits a word that fits no line */
	splitWiderThan?: number;
};

// plain TeX's \hyphenpenalty and \exhyphenpenalty
const HYPHEN_PENALTY = 50;
const EXPLICIT_HYPHEN_PENALTY = 50;
// a split inside a word costs about what a line stretched well past its spaces does, so a word that must split anyway
// fills the line before it rather than leave it gappy
const ANYWHERE_PENALTY = 200;
// stands in for infinite stretch, which sums cannot hold
const FILL = 1e6;
// the hyphen the stylesheet names for these breaks (hyphenate-character)
const HYPHEN = '-';
const ONE_WORD = /^(\P{L}*)(\p{L}{5,})(\P{L}*)$/u;
// an inline node view stands in the text as a letter, so a line ends beside it only at a space, as in TeX
const NODE_VIEW = 'x';
// a tab is as wide as the way to the next tab stop, which no item can say
const UNPLACEABLE = /[\t\r]/;
/** a node view that is partly on a line of its own and partly in the text carries this, and its paragraph wraps natively */
export const UNPLACEABLE_VIEW = 'data-unplaceable';

// a piece of the paragraph's text as one string: the offsets it covers in the paragraph, and its width or style.
// Struck words cover no offsets (`size` 0) and name their place inside their widget
type Run = { from: number; to: number; at: number; size: number } & (
	{ style: TextRunStyle; inside?: { key: string; start: number } } | { width: number }
);

function patternCuts(token: string, hyphenator: Hyphenator): number[] {
	const parts = ONE_WORD.exec(token);
	if (!parts) return [];
	const word = parts[2].toLowerCase();
	// a letter whose lowercase form is longer would shift every offset after it
	if (word.length !== parts[2].length) return [];
	return hyphenator(word).map((point) => parts[1].length + point);
}

let graphemes: Intl.Segmenter | undefined;

// between every two characters, keeping a mark with its base and an emoji sequence whole
function graphemeCuts(token: string): number[] {
	graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	const cuts: number[] = [];
	for (const { index } of graphemes.segment(token)) if (index > 0) cuts.push(index);
	return cuts;
}

const NO_BREAK: LineItem = { kind: 'penalty', width: 0, cost: Infinity, flagged: false, fromPatterns: false };
const END_OF_LINE: LineItem[] = [
	NO_BREAK,
	{ kind: 'glue', width: 0, stretch: FILL, shrink: 0 },
	{ kind: 'penalty', width: 0, cost: -Infinity, flagged: false, fromPatterns: false }
];

/** null when some part of the paragraph has a width this cannot know */
export function paragraphItems(
	view: EditorView,
	paragraph: PMNode,
	pos: number,
	block: HTMLElement,
	measures: ParagraphMeasures,
	struck: StruckWords[] = []
): ParagraphItems | null {
	const { styleOf, hyphenator, inlineWidthOf, wholeWord, splitWiderThan = Infinity } = measures;
	let text = '';
	const runs: Run[] = [];
	let placeable = true;
	let nextStruck = 0;

	function addStruck(words: StruckWords): void {
		if (words.lineEnd) {
			runs.push({ from: text.length, to: text.length + 1, at: words.at, size: 0, width: 0 });
			text += '\n';
			return;
		}
		for (const run of words.runs) {
			const span = words.element.querySelector(`[data-i="${run.from}"]`) ?? words.element;
			runs.push({
				from: text.length,
				to: text.length + run.to - run.from,
				at: words.at,
				size: 0,
				style: styleOf.ofElement(span),
				inside: { key: words.key, start: run.from }
			});
			text += words.text.slice(run.from, run.to);
		}
	}
	function addText(slice: string, at: number, style: TextRunStyle): void {
		runs.push({ from: text.length, to: text.length + slice.length, at, size: slice.length, style });
		text += slice;
	}

	paragraph.forEach((child, offset) => {
		if (!placeable) return;
		const at = offset + 1;
		while (nextStruck < struck.length && struck[nextStruck].at <= at) addStruck(struck[nextStruck++]);
		const from = text.length;
		if (child.type.name === 'hard_break') {
			runs.push({ from, to: from + 1, at, size: 1, width: 0 });
			text += '\n';
		} else if (!child.isText) {
			const dom = view.nodeDOM(pos + at);
			if (!(dom instanceof HTMLElement) || dom.hasAttribute(UNPLACEABLE_VIEW)) placeable = false;
			else if (getComputedStyle(dom).display === 'block' || dom.classList.contains('drawn-chip-line')) {
				// drawn on a line of its own (a comment, a vertical space): the line before it ends there, as at a \\
				runs.push({ from, to: from + 1, at, size: child.nodeSize, width: 0 });
				text += '\n';
			} else {
				runs.push({ from, to: from + 1, at, size: child.nodeSize, width: inlineWidthOf(dom) });
				text += NODE_VIEW;
			}
		} else {
			const style = styleOf.ofRun(view, block, child, pos + at);
			if (!style?.measurable || UNPLACEABLE.test(child.text!)) placeable = false;
			else {
				// struck words can sit in the middle of a text node
				let done = 0;
				while (nextStruck < struck.length && struck[nextStruck].at < at + child.text!.length) {
					const cut = struck[nextStruck].at - at;
					if (cut > done) addText(child.text!.slice(done, cut), at + done, style);
					done = cut;
					addStruck(struck[nextStruck++]);
				}
				addText(child.text!.slice(done), at + done, style);
			}
		}
	});
	while (nextStruck < struck.length) addStruck(struck[nextStruck++]);
	if (!placeable || runs.length === 0) return null;

	const items: LineItem[] = [];
	const marks = new Map<number, BreakMark>();
	let run = 0;

	function runOf(index: number): Run {
		while (run < runs.length - 1 && runs[run].to <= index) run++;
		while (run > 0 && runs[run].from > index) run--;
		return runs[run];
	}
	function offsetAt(index: number): number {
		const r = runOf(index);
		return 'style' in r && !r.inside ? r.at + index - r.from : r.at;
	}
	function offsetAfter(index: number): number {
		const r = runOf(index);
		return 'style' in r && !r.inside ? r.at + index - r.from + 1 : r.at + r.size;
	}
	// the characters from string index `from` up to `to`, all in one run, as a mark
	function markOf(from: number, to: number, kind: BreakMarkKind): BreakMark {
		const r = runOf(from);
		if ('style' in r && r.inside)
			return {
				from: r.at,
				to: r.at,
				kind,
				inside: { key: r.inside.key, from: r.inside.start + from - r.from, to: r.inside.start + to - r.from }
			};
		return { from: offsetAt(from), to: offsetAfter(to - 1), kind };
	}

	// a hyphenation point is drawn on the letter before it; a split anywhere on the whole character before it
	function addWord(token: string, index: number, style: TextRunStyle, cuts: number[], kind: 'hyphen' | 'anywhere'): void {
		let measured = 0;
		let last = 0;
		for (const cut of cuts) {
			const upTo = textWidth(style, token.slice(0, cut));
			items.push({ kind: 'box', width: upTo - measured });
			measured = upTo;
			marks.set(items.length, markOf(index + (kind === 'hyphen' ? cut - 1 : last), index + cut, kind));
			items.push(
				kind === 'hyphen'
					? { kind: 'penalty', width: textWidth(style, HYPHEN), cost: HYPHEN_PENALTY, flagged: true, fromPatterns: true }
					: { kind: 'penalty', width: 0, cost: ANYWHERE_PENALTY, flagged: false, fromPatterns: false }
			);
			last = cut;
		}
		items.push({ kind: 'box', width: textWidth(style, token) - measured });
	}

	// TeX hyphenates a word that follows glue, so one that follows a hyphen or a dash is left as it is; struck words
	// are neither hyphenated nor split
	function addBoxes(from: number, to: number, hyphenatable: boolean): void {
		for (let index = from; index < to;) {
			const r = runOf(index);
			const end = Math.min(to, r.to);
			if (!('style' in r)) items.push({ kind: 'box', width: r.width });
			else {
				const token = text.slice(index, end);
				if (!r.inside && textWidth(r.style, token) > splitWiderThan) addWord(token, index, r.style, graphemeCuts(token), 'anywhere');
				else {
					const typed = wholeWord !== null && pos + offsetAt(index) < wholeWord.to && wholeWord.from < pos + offsetAfter(end - 1);
					const oneWord = hyphenatable && hyphenator !== null && !typed && !r.inside && index === from && end === to;
					addWord(token, index, r.style, oneWord ? patternCuts(token, hyphenator) : [], 'hyphen');
				}
			}
			index = end;
		}
	}

	// spaces across a change of runs end a line together; the mark goes on the last run's share of them
	function addSpaces(from: number, to: number): void {
		let width = 0;
		let lastFrom = from;
		for (let i = from; i < to;) {
			const r = runOf(i);
			const end = Math.min(to, r.to);
			if ('style' in r) width += textWidth(r.style, text.slice(i, end));
			lastFrom = i;
			i = end;
		}
		marks.set(items.length, markOf(lastFrom, to, 'break'));
		items.push({ kind: 'glue', width, stretch: width / 2, shrink: 0 });
	}

	// a break with no space to mark is drawn on the character before it
	function markBefore(at: number): void {
		marks.set(items.length, markOf(at - 1, at, 'break'));
	}
	function halfSpace(index: number): number {
		const r = runOf(index);
		return 'style' in r ? textWidth(r.style, ' ') / 2 : 0;
	}

	let start = 0;
	let hyphenatable = true;
	for (const { at, dropFrom, kind } of breakOpportunities(text)) {
		addBoxes(start, dropFrom, hyphenatable);
		const spacesTo = kind === 'required' ? at - 1 : at;
		if (dropFrom < spacesTo) addSpaces(dropFrom, spacesTo);
		if (kind === 'end' || kind === 'required') items.push(...END_OF_LINE);
		else if (kind === 'ideographic') {
			markBefore(at);
			items.push({ kind: 'glue', width: 0, stretch: halfSpace(at - 1), shrink: 0 });
		} else if (kind === 'word') {
			markBefore(at);
			items.push({ kind: 'penalty', width: 0, cost: 0, flagged: false, fromPatterns: false });
		} else if (kind === 'joint') {
			markBefore(at);
			items.push({ kind: 'penalty', width: 0, cost: EXPLICIT_HYPHEN_PENALTY, flagged: true, fromPatterns: false });
		}
		hyphenatable = kind !== 'joint';
		start = at;
	}
	return { items, marks };
}
