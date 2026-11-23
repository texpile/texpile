// word ends for word motion and the word a double click selects, by Intl.Segmenter over a textblock's text (10.3)
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { CaretPlace } from '../contracts/geometryTypes';
import { segmentWords, textblockText, type WordSegment } from '../layout/text/wordSegments';

const segmentsOf = new WeakMap<PMNode, { language: string; segments: readonly WordSegment[] }>();

function wordSegmentsOf(textblock: PMNode, language: string): readonly WordSegment[] {
	const known = segmentsOf.get(textblock);
	if (known?.language === language) return known.segments;
	const segments = segmentWords(textblockText(textblock), language);
	segmentsOf.set(textblock, { language, segments });
	return segments;
}

function textblockOf($pos: ResolvedPos): { node: PMNode; start: number } | null {
	return $pos.parent.inlineContent ? { node: $pos.parent, start: $pos.start() } : null;
}

const PUNCTUATION = /\p{P}/u;
// an inline leaf stands in the text as U+FFFC and counts as a word
const ALPHANUMERIC = /[\p{L}\p{N}\p{M}￼]/u;

function isPunctuation(text: string, at: number): boolean {
	const code = text.charCodeAt(at);
	return PUNCTUATION.test(text[at]) || (code >= 0xd800 && code <= 0xdfff);
}

function isAlphanumeric(text: string, at: number): boolean {
	return ALPHANUMERIC.test(text[at] ?? '');
}

/** segment edges outside inline nodes, ascending */
function breaksOf(node: PMNode, language: string): number[] {
	const inside = new Set<number>();
	node.forEach((child, offset) => {
		for (let at = offset + 1; !child.isText && at < offset + child.nodeSize; at++) inside.add(at);
	});
	const edges = new Set<number>([0]);
	for (const segment of wordSegmentsOf(node, language)) edges.add(segment.to);
	return [...edges].filter((edge) => !inside.has(edge)).sort((a, b) => a - b);
}

/** blink's NextWordPositionInternal: past spaces, then a word, or a run of punctuation not glued to one */
function nextWordStop(text: string, breaks: readonly number[], offset: number, skipSpaces: boolean): number {
	for (const runner of breaks) {
		if (runner <= offset) continue;
		if (runner < text.length && isPunctuation(text, runner) && !isAlphanumeric(text, runner - 1)) continue;
		if (!(isAlphanumeric(text, runner - 1) || isPunctuation(text, runner - 1) || text[runner - 1] === '\n')) continue;
		if (!skipSpaces) return runner;
		let after = runner;
		while (text[after] === ' ' || text[after] === ' ') after++;
		return after;
	}
	return text.length;
}

/** blink's PreviousWordPositionInternal: the start of the word before, a punctuation run accumulated */
function previousWordStop(text: string, breaks: readonly number[], offset: number): number {
	let punctuationRun = -1;
	for (let i = breaks.length - 1; i >= 0; i--) {
		const runner = breaks[i];
		if (runner >= offset) continue;
		if (runner < text.length && isPunctuation(text, runner)) {
			if (runner > 0 && isAlphanumeric(text, runner - 1)) return runner;
			punctuationRun = runner;
			continue;
		}
		if (punctuationRun >= 0) return punctuationRun;
		if (isAlphanumeric(text, runner)) return runner;
	}
	return punctuationRun >= 0 ? punctuationRun : 0;
}

/** Chromium's word moves inside one textblock; previousStart for Left, nextEnd (Linux, macOS) or nextStart (Windows) for Right */
export function wordBoundaryIn($pos: ResolvedPos, dir: -1 | 1, rule: 'previousStart' | 'nextStart' | 'nextEnd', language: string): number {
	const textblock = textblockOf($pos);
	if (!textblock) return $pos.pos;
	const { node, start } = textblock;
	const offset = $pos.pos - start;
	const text = textblockText(node);
	const breaks = breaksOf(node, language);
	return start + (dir < 0 ? previousWordStop(text, breaks, offset) : nextWordStop(text, breaks, offset, rule === 'nextStart'));
}

/** the word at the place; at the edge of a word and something else, the word; between two words, the affinity's side */
export function wordRangeIn($pos: ResolvedPos, place: CaretPlace, language: string): { from: number; to: number } {
	const textblock = textblockOf($pos);
	if (!textblock) return { from: place.pos, to: place.pos };
	const { node, start } = textblock;
	const offset = place.pos - start;
	const segments = wordSegmentsOf(node, language);
	const inside = segments.find((segment) => segment.from < offset && offset < segment.to);
	if (inside) return { from: start + inside.from, to: start + inside.to };
	const before = segments.find((segment) => segment.to === offset);
	const after = segments.find((segment) => segment.from === offset);
	const pick =
		before?.word && after?.word ? (place.affinity < 0 ? before : after) : before?.word ? before : after?.word ? after : (after ?? before);
	return pick ? { from: start + pick.from, to: start + pick.to } : { from: place.pos, to: place.pos };
}
