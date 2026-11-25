// extended grapheme clusters: caret stops and Delete step over a whole one; Backspace deletes one code point,
// except in the emoji sequences Chromium's backspace state machine takes whole
let segmenter: Intl.Segmenter | null = null;

function graphemeSegmenter(): Intl.Segmenter {
	segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	return segmenter;
}

/** every cluster boundary, 0 and text.length included */
export function graphemeBoundaries(text: string): number[] {
	if (!text) return [0];
	if (/^[\x20-\x7e]*$/.test(text)) return Array.from({ length: text.length + 1 }, (_, i) => i);
	const boundaries = [...graphemeSegmenter().segment(text)].map((segment) => segment.index);
	boundaries.push(text.length);
	return boundaries;
}

export function graphemeCount(text: string): number {
	if (/^[\x20-\x7e]*$/.test(text)) return text.length;
	let count = 0;
	for (const _ of graphemeSegmenter().segment(text)) count++;
	return count;
}

/** the boundary after offset, or text.length */
export function nextGraphemeEnd(text: string, offset: number): number {
	return graphemeBoundaries(text).find((boundary) => boundary > offset) ?? text.length;
}

/** the boundary before offset, or 0 */
export function previousGraphemeStart(text: string, offset: number): number {
	return graphemeBoundaries(text).findLast((boundary) => boundary < offset) ?? 0;
}

const WHOLE_CLUSTER =
	/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3|[\ufe00-\ufe0f]|[\u{e0020}-\u{e007f}]|[\u{1f3fb}-\u{1f3ff}]/u;

/** where Backspace at offset starts deleting: CR LF and emoji, flag, keycap and variation sequences whole, else one code point */
export function backspaceStart(text: string, offset: number): number {
	if (offset <= 0) return 0;
	const clusterStart = previousGraphemeStart(text, offset);
	const cluster = text.slice(clusterStart, offset);
	if (cluster === '\r\n' || WHOLE_CLUSTER.test(cluster)) return clusterStart;
	const code = text.codePointAt(offset - 2);
	return code !== undefined && code > 0xffff && offset >= 2 ? offset - 2 : offset - 1;
}
