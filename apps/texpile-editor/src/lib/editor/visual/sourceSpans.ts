// where each run of the rendered document came from in the file, so a place in one editor is a
// lookup in the other. Leaves are recorded while a document is built (by node, the only handle
// there is before positions exist) and collected into position-keyed segments once it stands
import type { Node as PMNode } from 'prosemirror-model';

/** text: the characters are the bytes. sub: the characters stand for the bytes without being them
 *  (an accent, a ligature, a collapsed line wrap, a construct drawn as one node) */
export type SpanKind = 'text' | 'sub';

/** one run of a leaf: `from`/`to` count characters into a text node (a whole atom is 0 to 1),
 *  `srcFrom`/`srcTo` index the text the leaf was parsed from */
export type LeafSpan = { from: number; to: number; srcFrom: number; srcTo: number; kind: SpanKind };

/** one run of the finished document, ProseMirror positions against file offsets */
export type Segment = { pmFrom: number; pmTo: number; srcFrom: number; srcTo: number; kind: SpanKind };

const leafSpans = new WeakMap<PMNode, LeafSpan[]>();

/** record where a leaf came from; hands the node back so a builder can pass it straight on */
export function noteSpans<T extends PMNode>(node: T, spans: LeafSpan[] | null | undefined): T {
	if (spans && spans.length > 0) leafSpans.set(node, spans);
	return node;
}

export function spansOf(node: PMNode): LeafSpan[] | undefined {
	return leafSpans.get(node);
}

/** the same node with other attributes, still knowing where it came from */
export function withAttrs<T extends PMNode>(node: T, attrs: Record<string, unknown>): T {
	const out = noteSpans(node.type.create(attrs, node.content, node.marks) as T, leafSpans.get(node));
	const span = blockSpans.get(node);
	if (span) blockSpans.set(out, span);
	return out;
}

/** a text that is its bytes, one for one */
export function bytesSpan(len: number, srcFrom: number): LeafSpan[] {
	return len > 0 ? [{ from: 0, to: len, srcFrom, srcTo: srcFrom + len, kind: 'text' }] : [];
}

/** a text standing for a byte range, whatever its characters */
export function standsFor(len: number, srcFrom: number, srcTo: number): LeafSpan[] {
	return len > 0 && srcTo > srcFrom ? [{ from: 0, to: len, srcFrom, srcTo, kind: 'sub' }] : [];
}

/** `text` against the bytes it was read from, character by character: equal stretches are text,
 *  the rest stand in. Texts of another length stand for the whole slice */
export function alignedSpans(text: string, srcFrom: number, slice: string): LeafSpan[] {
	if (text.length !== slice.length) return standsFor(text.length, srcFrom, srcFrom + slice.length);
	const out: LeafSpan[] = [];
	let i = 0;
	while (i < text.length) {
		const same = text[i] === slice[i];
		let j = i + 1;
		while (j < text.length && (text[j] === slice[j]) === same) j++;
		out.push({ from: i, to: j, srcFrom: srcFrom + i, srcTo: srcFrom + j, kind: same ? 'text' : 'sub' });
		i = j;
	}
	return out;
}

export type CharSource = { srcFrom: number; srcTo: number; kind: SpanKind } | null;

/** one record per character, for edits that change the text */
export function charsOf(len: number, spans: LeafSpan[] | undefined): CharSource[] {
	const chars: CharSource[] = new Array(len).fill(null);
	for (const s of spans ?? []) {
		for (let i = s.from; i < s.to && i < len; i++) {
			chars[i] =
				s.kind === 'text'
					? { srcFrom: s.srcFrom + (i - s.from), srcTo: s.srcFrom + (i - s.from) + 1, kind: 'text' }
					: { srcFrom: s.srcFrom, srcTo: s.srcTo, kind: 'sub' };
		}
	}
	return chars;
}

/** runs back out of a per-character record */
export function spansOfChars(chars: CharSource[]): LeafSpan[] {
	const out: LeafSpan[] = [];
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i];
		if (!c) continue;
		const last = out[out.length - 1];
		const joins =
			last &&
			last.to === i &&
			last.kind === c.kind &&
			(c.kind === 'text' ? last.srcTo === c.srcFrom : last.srcFrom === c.srcFrom && last.srcTo === c.srcTo);
		if (joins) {
			last.to = i + 1;
			if (c.kind === 'text') last.srcTo = c.srcTo;
			continue;
		}
		out.push({ from: i, to: i + 1, srcFrom: c.srcFrom, srcTo: c.srcTo, kind: c.kind });
	}
	return out;
}

/** the spans of `text.slice(from, to)`, counted from its own start */
export function sliceSpans(text: string, spans: LeafSpan[] | undefined, from: number, to: number): LeafSpan[] {
	return spansOfChars(charsOf(text.length, spans).slice(from, to));
}

/** the spans of several texts laid end to end */
export function concatSpans(parts: { len: number; spans: LeafSpan[] | undefined }[]): LeafSpan[] {
	const out: LeafSpan[] = [];
	let at = 0;
	for (const p of parts) {
		for (const s of p.spans ?? []) {
			const last = out[out.length - 1];
			if (last && last.kind === 'text' && s.kind === 'text' && last.to === s.from + at && last.srcTo === s.srcFrom) {
				last.to = s.to + at;
				last.srcTo = s.srcTo;
			} else out.push({ ...s, from: s.from + at, to: s.to + at });
		}
		at += p.len;
	}
	return out;
}

/** `text` with every `pattern` replaced, the record kept in step: the new characters stand for the
 *  bytes the old ones did */
export function replaceKeepingSpans(
	text: string,
	chars: CharSource[],
	pattern: string,
	replacement: string
): { text: string; chars: CharSource[] } {
	let out = '';
	const outChars: CharSource[] = [];
	let i = 0;
	while (i < text.length) {
		if (!text.startsWith(pattern, i)) {
			out += text[i];
			outChars.push(chars[i]);
			i++;
			continue;
		}
		const taken = chars.slice(i, i + pattern.length).filter((c): c is NonNullable<CharSource> => c !== null);
		const src: CharSource = taken.length
			? { srcFrom: Math.min(...taken.map((c) => c.srcFrom)), srcTo: Math.max(...taken.map((c) => c.srcTo)), kind: 'sub' }
			: null;
		out += replacement;
		for (let k = 0; k < replacement.length; k++) outChars.push(src);
		i += pattern.length;
	}
	return { text: out, chars: outChars };
}

/** the document's runs in position order; `srcOffset` moves records made against a body onto the file */
export function collectSpans(doc: PMNode, srcOffset = 0): Segment[] {
	const out: Segment[] = [];
	doc.descendants((node, pos) => {
		const spans = leafSpans.get(node);
		if (!spans) return true;
		if (node.isText) {
			for (const s of spans)
				out.push({ pmFrom: pos + s.from, pmTo: pos + s.to, srcFrom: s.srcFrom + srcOffset, srcTo: s.srcTo + srcOffset, kind: s.kind });
			return true;
		}
		// a whole node standing for its construct, its children with it
		const s = spans[0];
		out.push({ pmFrom: pos, pmTo: pos + node.nodeSize, srcFrom: s.srcFrom + srcOffset, srcTo: s.srcTo + srcOffset, kind: 'sub' });
		return false;
	});
	return out;
}

/** the whole map of a document: every leaf run, and the source range of each top-level block */
export type SourceMap = {
	leaves: Segment[];
	blocks: Segment[];
	/** the source range of every block below the top level the parse could place, in position
	 *  order; absent from a map a serializer made, since only a parse places blocks */
	inner?: Segment[];
};

/** a stretch of a file parsed on its own: the document it makes and where its runs sit in the stretch */
export type RegionParse = { doc: PMNode; map: SourceMap };
export type RegionParser = (source: string) => RegionParse;

export function emptyMap(): SourceMap {
	return { leaves: [], blocks: [], inner: [] };
}

/** where a top-level block's construct sits in the text it was parsed from, noted by the parser on
 *  the node like a leaf's spans; `size` is how many blocks the construct became, noted on the first
 *  of them (an itemize is one list node per item). Not noted: the parse could not place the block */
export type BlockSpan = { srcFrom: number; srcTo: number; size: number };

const blockSpans = new WeakMap<PMNode, BlockSpan>();

export function noteBlockSpan<T extends PMNode>(node: T, span: BlockSpan | null | undefined): T {
	if (span) blockSpans.set(node, span);
	return node;
}

export function blockSpanOf(node: PMNode): BlockSpan | undefined {
	return blockSpans.get(node);
}

/** a block holding blocks: an environment, a list item, a quote, a table cell */
export function isContainer(node: PMNode): boolean {
	return node.isBlock && !node.isTextblock && node.childCount > 0 && node.firstChild!.isBlock;
}

/** the ranges of `parent`'s children that carry a span, `at` being the position its content starts */
function childRanges(parent: PMNode, at: number, srcOffset: number, into: Segment[]): void {
	let pos = at;
	let i = 0;
	while (i < parent.childCount) {
		const start = pos;
		const span = blockSpans.get(parent.child(i));
		if (!span) {
			pos += parent.child(i).nodeSize;
			i++;
			continue;
		}
		// one source construct that became several blocks (an itemize is one list node per item) is one range
		let size = 0;
		for (let k = 0; k < span.size && i + k < parent.childCount; k++) {
			pos += parent.child(i + k).nodeSize;
			size++;
		}
		into.push({ pmFrom: start, pmTo: pos, srcFrom: srcOffset + span.srcFrom, srcTo: srcOffset + span.srcTo, kind: 'sub' });
		i += size;
	}
}

/** the map of a freshly parsed document: leaves from the registry, blocks from the spans the parse
 *  noted on them, at the top level and inside every container */
export function collectMap(doc: PMNode, srcOffset = 0): SourceMap {
	const leaves = collectSpans(doc, srcOffset);
	const blocks: Segment[] = [];
	childRanges(doc, 0, srcOffset, blocks);
	const inner: Segment[] = [];
	doc.descendants((node, pos) => {
		if (!node.isBlock) return false;
		if (isContainer(node)) childRanges(node, pos + 1, srcOffset, inner);
		return true;
	});
	return { leaves, blocks, inner };
}

/** the map of a text after every bare line feed became a carriage return and line feed */
export function mapToCrlf(map: SourceMap, text: string): SourceMap {
	const before = new Array<number>(text.length + 1);
	let n = 0;
	for (let i = 0; i <= text.length; i++) {
		before[i] = n;
		if (text[i] === '\n' && text[i - 1] !== '\r') n++;
	}
	function shift(s: Segment): Segment {
		return { ...s, srcFrom: s.srcFrom + before[s.srcFrom], srcTo: s.srcTo + before[s.srcTo] };
	}
	return { leaves: map.leaves.map(shift), blocks: map.blocks.map(shift), inner: (map.inner ?? []).map(shift) };
}

export function shiftSegment(s: Segment, dpm: number, dsrc: number): Segment {
	return { pmFrom: s.pmFrom + dpm, pmTo: s.pmTo + dpm, srcFrom: s.srcFrom + dsrc, srcTo: s.srcTo + dsrc, kind: s.kind };
}

/** a map whose lists are made when one is first read: a visual edit makes a map on every key, and typing reads none */
export function lazyMap(make: () => SourceMap): SourceMap {
	let made: SourceMap | undefined;
	function lists(): SourceMap {
		return (made ??= make());
	}
	return Object.defineProperties({} as SourceMap, {
		leaves: { enumerable: true, get: () => lists().leaves },
		blocks: { enumerable: true, get: () => lists().blocks },
		inner: { enumerable: true, get: () => lists().inner }
	});
}

/** the map with its source side moved by `dsrc` and cut to `[0, srcLength)`; runs left empty by the cut go */
export function shiftMap(map: SourceMap, dsrc: number, srcLength: number): SourceMap {
	function move(list: Segment[]): Segment[] {
		const out: Segment[] = [];
		for (const s of list) {
			const srcFrom = Math.min(srcLength, Math.max(0, s.srcFrom + dsrc));
			const srcTo = Math.min(srcLength, Math.max(0, s.srcTo + dsrc));
			if (srcTo > srcFrom) out.push({ pmFrom: s.pmFrom, pmTo: s.pmTo, srcFrom, srcTo, kind: s.kind });
		}
		return out;
	}
	return { leaves: move(map.leaves), blocks: move(map.blocks), inner: move(map.inner ?? []) };
}

const srcOrder = new WeakMap<Segment[], Segment[]>();

export function bySource(spans: Segment[]): Segment[] {
	let sorted = srcOrder.get(spans);
	if (!sorted) {
		sorted = [...spans].sort((a, b) => a.srcFrom - b.srcFrom || a.srcTo - b.srcTo);
		srcOrder.set(spans, sorted);
	}
	return sorted;
}

/** index of the last segment starting at or before `at` along `key`, or -1 */
export function indexStartingBy(spans: Segment[], key: 'pmFrom' | 'srcFrom', at: number): number {
	let lo = 0;
	let hi = spans.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (spans[mid][key] <= at) {
			found = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return found;
}

type Side = -1 | 1;

function within(spans: Segment[], from: 'pmFrom' | 'srcFrom', to: 'pmTo' | 'srcTo', at: number, assoc: Side): Segment | null {
	const i = indexStartingBy(spans, from, at);
	if (i < 0) return null;
	let s = spans[i];
	// at a boundary two segments share, the caller says whether the one ending there or the one starting there is meant
	if (assoc < 0 && s[from] === at && i > 0 && spans[i - 1][to] === at) s = spans[i - 1];
	return at >= s[from] && at <= s[to] ? s : null;
}

/** the file offset of a document position, or null where the document has no bytes of its own */
export function pmToSource(spans: Segment[], pos: number, assoc: Side = -1): number | null {
	const s = within(spans, 'pmFrom', 'pmTo', pos, assoc);
	if (!s) return null;
	if (s.kind === 'text') return s.srcFrom + (pos - s.pmFrom);
	// characters that stand for bytes: the one on the side named belongs to the whole of them
	if (pos === s.pmFrom) return s.srcFrom;
	if (pos === s.pmTo) return s.srcTo;
	return assoc < 0 ? s.srcTo : s.srcFrom;
}

/** the document position of a file offset, or null for bytes no leaf came from */
export function sourceToPm(spans: Segment[], offset: number, assoc: Side = -1): number | null {
	const s = within(bySource(spans), 'srcFrom', 'srcTo', offset, assoc);
	if (!s) return null;
	if (s.kind === 'text') return s.pmFrom + (offset - s.srcFrom);
	if (offset === s.srcFrom) return s.pmFrom;
	if (offset === s.srcTo) return s.pmTo;
	return assoc < 0 ? s.pmTo : s.pmFrom;
}

/** pmToSource, else the edge of the nearest run on the side `assoc` names; null only for a document with no runs */
export function nearestSource(spans: Segment[], pos: number, assoc: Side = -1): number | null {
	const exact = pmToSource(spans, pos, assoc);
	if (exact !== null) return exact;
	const i = indexStartingBy(spans, 'pmFrom', pos);
	const before = i >= 0 ? spans[i] : null;
	const after = i + 1 < spans.length ? spans[i + 1] : null;
	const pick = assoc < 0 ? (before ?? after) : (after ?? before);
	if (!pick) return null;
	return pick === before ? pick.srcTo : pick.srcFrom;
}

/** sourceToPm, else the edge of the nearest run on the side `assoc` names; null only for a document with no runs */
export function nearestPm(spans: Segment[], offset: number, assoc: Side = 1): number | null {
	const exact = sourceToPm(spans, offset, assoc);
	if (exact !== null) return exact;
	const sorted = bySource(spans);
	const i = indexStartingBy(sorted, 'srcFrom', offset);
	const before = i >= 0 ? sorted[i] : null;
	const after = i + 1 < sorted.length ? sorted[i + 1] : null;
	const pick = assoc < 0 ? (before ?? after) : (after ?? before);
	if (!pick) return null;
	return pick === before ? pick.pmTo : pick.pmFrom;
}
