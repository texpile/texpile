// which parse each block came from, and what it knew of its bytes
import type { Node as PMNode } from 'prosemirror-model';
import { indexStartingBy, isContainer, spansOf, type Segment, type SourceMap } from './sourceSpans';

/** the text a document was parsed from, and the stretch of it the document stands for (the body of a
 *  file whose preamble and postamble the parse never saw) */
export type ParseBody = { text: string; from: number; to: number };

/** what a parse knew about one of its top-level blocks, kept by node: a block still the one the parse
 *  made can be written out as the bytes it came from, with its leaf runs carried along */
export type BlockOrigin = {
	parse: ParseOrigins;
	/** the block's place among the parse's top-level blocks */
	index: number;
	/** the parsed block itself, which a block standing in for it must equal */
	node: PMNode;
	/** the construct's place in the parsed document and its leaf runs, in the parse's coordinates */
	pmFrom: number;
	pmTo: number;
	leaves: Segment[];
	/** the construct's bytes, in the file; absent when the parse could not place the block */
	srcFrom?: number;
	srcTo?: number;
	text?: string;
	/** the bytes between the construct before and this one; null when either could not be placed,
	 *  '' on every block of a construct but its first */
	pre: string | null;
	/** how many blocks the construct became, and which of them this is */
	size: number;
	member: number;
};

/** a place where the map contradicts the bytes or itself: a run outside the block it lies in, two
 *  runs claiming one byte, a text run that is not its bytes. The block holding it is not placed:
 *  it is written out afresh from the document, untouched or not, as a block the parse could not
 *  place is, so a span short of its bytes can neither drop them nor write them twice */
export type MapDefect = {
	kind: 'outside' | 'overlap' | 'mismatch';
	srcFrom: number;
	srcTo: number;
	pmFrom: number;
	pmTo: number;
	detail: string;
};

/** one parse's top-level blocks in order, and the bytes after the last of them (null when it could
 *  not be placed). `verbatim` says a block still the parse's own may be written out as its bytes; a
 *  parse that only tells gaps and neighbours apart (a converter's own output, a document made to
 *  forget its source) has every block regenerate */
export type ParseOrigins = {
	origins: BlockOrigin[];
	tail: string | null;
	verbatim: boolean;
	/** where the body the leaves were recorded against begins in the file the origins slice */
	from: number;
	/** what the parse's map got wrong, at any depth; shared by the parse's containers */
	defects: MapDefect[];
};

/**
 * Whether the leaf runs of the block at `block` can be believed against the bytes: every run inside
 * the block, no two runs claiming a byte, a text run being its bytes (a bare line feed standing for
 * a carriage return and line feed aside). What fails is recorded on `defects`.
 */
function soundLeaves(doc: PMNode, body: ParseBody, block: Segment, leaves: Segment[], defects: MapDefect[]): boolean {
	let ok = true;
	function bad(kind: MapDefect['kind'], s: Segment, detail: string) {
		defects.push({ kind, srcFrom: s.srcFrom, srcTo: s.srcTo, pmFrom: s.pmFrom, pmTo: s.pmTo, detail });
		ok = false;
	}
	for (const s of leaves) {
		if (s.srcFrom > s.srcTo || s.srcFrom < block.srcFrom || s.srcTo > block.srcTo || s.srcFrom < body.from || s.srcTo > body.to) {
			bad('outside', s, `run ${s.srcFrom}..${s.srcTo} outside its block ${block.srcFrom}..${block.srcTo}`);
			continue;
		}
		if (s.kind !== 'text') continue;
		const shown = doc.textBetween(s.pmFrom, s.pmTo);
		const bytes = body.text.slice(s.srcFrom, s.srcTo);
		if (shown !== bytes && shown !== bytes.replace(/\r\n/g, '\n'))
			bad('mismatch', s, `a text run is not its bytes: ${JSON.stringify(shown)} for ${JSON.stringify(bytes)} at ${s.srcFrom}`);
	}
	const bySrc = [...leaves].sort((a, b) => a.srcFrom - b.srcFrom || a.srcTo - b.srcTo);
	for (let i = 1; i < bySrc.length; i++) {
		const prev = bySrc[i - 1];
		const s = bySrc[i];
		if (prev.srcTo > s.srcFrom)
			bad('overlap', s, `two runs claim bytes ${s.srcFrom}..${prev.srcTo}: ${JSON.stringify(body.text.slice(s.srcFrom, prev.srcTo))}`);
	}
	return ok;
}

const blockOrigins = new WeakMap<PMNode, BlockOrigin>();
const docParses = new WeakMap<PMNode, ParseOrigins>();
// what the parse knew of one container's children: never a document's own parse
const containerParses = new WeakSet<ParseOrigins>();

/**
 * Record what the parse knew about every top-level block of `doc`, the document it made from `body`
 * with `map` saying where. The blocks and the document itself are keyed by node, so a serializer
 * handed a later document can still tell which blocks the parse made. A converter registers its
 * own output without `verbatim`: the gaps and constructs are known, the bytes are not written back
 * until the roundtrip glue registers the document against the file the body came from.
 */
export function rememberParseMap(doc: PMNode, map: SourceMap, body: ParseBody | null, verbatim = true): ParseOrigins {
	const parse: ParseOrigins = { origins: [], tail: null, verbatim, from: body ? body.from : 0, defects: [] };
	// the top-level blocks whose runs are not believed, by position: nothing inside them is either
	const unsound: Segment[] = [];
	const n = doc.childCount;
	let b = 0;
	let l = 0;
	let pos = 0;
	// where the construct before ended in the file; null once one could not be placed
	let prevEnd: number | null = body ? body.from : 0;
	let i = 0;
	while (i < n) {
		const start = pos;
		while (b < map.blocks.length && map.blocks[b].pmFrom < start) b++;
		const block = b < map.blocks.length && map.blocks[b].pmFrom === start ? map.blocks[b] : null;
		if (!block) {
			const child = doc.child(i);
			pos += child.nodeSize;
			parse.origins.push({ parse, index: i, node: child, pmFrom: start, pmTo: pos, leaves: [], pre: null, size: 1, member: 0 });
			prevEnd = null;
			i++;
			continue;
		}
		while (l < map.leaves.length && map.leaves[l].pmFrom < block.pmFrom) l++;
		const leaves: Segment[] = [];
		for (let k = l; k < map.leaves.length && map.leaves[k].pmFrom < block.pmTo; k++) leaves.push(map.leaves[k]);
		let size = 0;
		let end = start;
		while (i + size < n && end < block.pmTo) {
			end += doc.child(i + size).nodeSize;
			size++;
		}
		// a block whose runs contradict it is not placed at all: its span may be short of its bytes,
		// and a block written afresh before a gap still holding the rest would write them twice
		if (body && !soundLeaves(doc, body, block, leaves, parse.defects)) {
			unsound.push(block);
			let at = start;
			for (let k = 0; k < size; k++) {
				const child = doc.child(i + k);
				parse.origins.push({
					parse,
					index: i + k,
					node: child,
					pmFrom: at,
					pmTo: at + child.nodeSize,
					leaves: [],
					pre: null,
					size: 1,
					member: 0
				});
				at += child.nodeSize;
			}
			prevEnd = null;
			pos = end;
			i += size;
			continue;
		}
		const text = body ? body.text.slice(block.srcFrom, block.srcTo) : undefined;
		const pre = body && prevEnd != null && prevEnd <= block.srcFrom ? body.text.slice(prevEnd, block.srcFrom) : null;
		for (let k = 0; k < size; k++) {
			parse.origins.push({
				parse,
				index: i + k,
				node: doc.child(i + k),
				pmFrom: block.pmFrom,
				pmTo: block.pmTo,
				leaves,
				...(body ? { srcFrom: block.srcFrom, srcTo: block.srcTo, text } : {}),
				pre: k === 0 ? pre : '',
				size,
				member: k
			});
		}
		prevEnd = block.srcTo;
		pos = end;
		i += size;
	}
	parse.tail = body && prevEnd != null && prevEnd <= body.to ? body.text.slice(prevEnd, body.to) : null;
	for (const o of parse.origins) blockOrigins.set(o.node, o);
	docParses.set(doc, parse);
	rememberContainers(doc, map, body, verbatim, parse.defects, unsound);
	return parse;
}

/**
 * The same record for every container in the document: its children against the ranges the parse
 * placed them at, so a container written out afresh still writes its untouched children as their
 * bytes. A child's range is believed only inside its container's own and after its sibling's.
 */
function rememberContainers(
	doc: PMNode,
	map: SourceMap,
	body: ParseBody | null,
	verbatim: boolean,
	defects: MapDefect[],
	unsound: Segment[]
): void {
	const inner = map.inner ?? [];
	if (inner.length === 0) return;
	const byStart = new Map<number, Segment>();
	for (const s of inner) byStart.set(s.pmFrom, s);
	function believed(seg: Segment): boolean {
		return !unsound.some((u) => seg.pmFrom >= u.pmFrom && seg.pmTo <= u.pmTo);
	}
	doc.descendants((node, pos) => {
		if (!node.isBlock) return false;
		if (!isContainer(node)) return true;
		const own = blockOrigins.get(node);
		const bounds = own && own.srcFrom !== undefined ? { from: own.srcFrom, to: own.srcTo! } : null;
		const parse: ParseOrigins = { origins: [], tail: null, verbatim, from: body ? body.from : 0, defects };
		containerParses.add(parse);
		let at = pos + 1;
		let prevEnd: number | null = null;
		let i = 0;
		while (i < node.childCount) {
			const start = at;
			const seg = byStart.get(start);
			const leaves: Segment[] = [];
			if (seg) {
				for (
					let l = Math.max(0, indexStartingBy(map.leaves, 'pmFrom', seg.pmFrom));
					l < map.leaves.length && map.leaves[l].pmFrom < seg.pmTo;
					l++
				) {
					if (map.leaves[l].pmFrom >= seg.pmFrom) leaves.push(map.leaves[l]);
				}
			}
			const placed =
				!!seg &&
				(!bounds || (seg.srcFrom >= bounds.from && seg.srcTo <= bounds.to)) &&
				(prevEnd == null || seg.srcFrom >= prevEnd) &&
				believed(seg) &&
				(!body || soundLeaves(doc, body, seg, leaves, defects));
			if (!seg || !placed) {
				const child = node.child(i);
				at += child.nodeSize;
				parse.origins.push({ parse, index: i, node: child, pmFrom: start, pmTo: at, leaves: [], pre: null, size: 1, member: 0 });
				prevEnd = null;
				i++;
				continue;
			}
			let size = 0;
			while (i + size < node.childCount && at < seg.pmTo) {
				at += node.child(i + size).nodeSize;
				size++;
			}
			const text = body ? body.text.slice(seg.srcFrom, seg.srcTo) : undefined;
			const pre = body && prevEnd != null ? body.text.slice(prevEnd, seg.srcFrom) : null;
			for (let k = 0; k < size; k++) {
				parse.origins.push({
					parse,
					index: i + k,
					node: node.child(i + k),
					pmFrom: seg.pmFrom,
					pmTo: seg.pmTo,
					leaves,
					...(body ? { srcFrom: seg.srcFrom, srcTo: seg.srcTo, text } : {}),
					pre: k === 0 ? pre : '',
					size,
					member: k
				});
			}
			prevEnd = seg.srcTo;
			i += size;
		}
		for (const o of parse.origins) blockOrigins.set(o.node, o);
		docParses.set(node, parse);
		return true;
	});
}

/** what a parse got wrong, on the console: each defect is a parser position bug worth a report */
export function warnMapDefects(where: string, parse: ParseOrigins): void {
	if (parse.defects.length === 0) return;
	const shown = parse.defects.slice(0, 3).map((d) => `${d.kind} ${d.srcFrom}..${d.srcTo}: ${d.detail}`);
	console.warn(`[${where}] ${parse.defects.length} block(s) written afresh: the source map contradicts the bytes\n  ${shown.join('\n  ')}`);
}

/** a parse that knows nothing: for a document with no source behind it */
export function noParse(): ParseOrigins {
	return { origins: [], tail: null, verbatim: false, from: 0, defects: [] };
}

/** what the parse knew about the children of one of its containers, by the container node it made */
export function containerOriginsOf(parsed: PMNode): ParseOrigins | undefined {
	return docParses.get(parsed);
}

export function containerRecordAround(node: PMNode): ParseOrigins | undefined {
	for (let i = 0; i < node.childCount; i++) {
		const o = blockOrigins.get(node.child(i));
		if (o && containerParses.has(o.parse)) return o.parse;
	}
	return undefined;
}

/** a later document is the parse's own: its blocks answer to the parse from here on */
export function adoptParse(doc: PMNode, parse: ParseOrigins): void {
	docParses.set(doc, parse);
}

/** `parse` with block `index` standing for `node` over the same bytes, `leaves` counted from its start;
 *  unchanged when the runs do not place every byte the parse placed, or misread one */
export function withBlockRuns(parse: ParseOrigins, index: number, node: PMNode, leaves: Segment[]): ParseOrigins {
	const was = parse.origins[index];
	if (!was || was.size !== 1 || was.text === undefined || was.srcFrom === undefined || node.eq(was.node)) return parse;
	const base = was.srcFrom;
	const placed = new Uint8Array(was.text.length);
	for (const s of leaves) {
		if (s.srcFrom < base || s.srcTo > was.srcTo! || s.pmFrom < 1 || s.pmTo > node.nodeSize - 1) return parse;
		for (let b = s.srcFrom; b < s.srcTo; b++) if (placed[b - base]++) return parse;
		const bytes = was.text.slice(s.srcFrom - base, s.srcTo - base);
		const shown = node.textBetween(s.pmFrom - 1, s.pmTo - 1);
		if (s.kind === 'text' && shown !== bytes && shown !== bytes.replace(/\r\n/g, '\n')) return parse;
	}
	for (const s of was.leaves) for (let b = s.srcFrom; b < s.srcTo; b++) if (!placed[b - base]) return parse;
	const out: ParseOrigins = { ...parse, origins: [] };
	for (const o of parse.origins)
		out.origins.push(o === was ? { ...o, parse: out, node, pmFrom: 0, pmTo: node.nodeSize, leaves } : { ...o, parse: out });
	blockOrigins.set(node, out.origins[index]);
	return out;
}

/** the parse a document came from: recorded on it, else the one any of its blocks remembers */
export function parseOf(doc: PMNode): ParseOrigins | undefined {
	const known = docParses.get(doc);
	if (known) return known;
	// a block Shift+Tab or a drag brought up from inside a container remembers that container's record
	for (let i = 0; i < doc.childCount; i++) {
		const o = blockOrigins.get(doc.child(i));
		if (o && !containerParses.has(o.parse)) return o.parse;
	}
	return undefined;
}

/** the same block made afresh at every depth, a node no parse knows: written out whole by the
 *  deterministic rules, its untouched children included. type.create, not copy: copy hands the
 *  same node back for the same content, and a container would find a child it still knows */
export function forgetBlock(node: PMNode): PMNode {
	if (!isContainer(node)) return node.type.create(node.attrs, node.content, node.marks);
	const kids: PMNode[] = [];
	node.forEach((child) => kids.push(forgetBlock(child)));
	return node.type.create(node.attrs, kids, node.marks);
}

/** the same document with its bytes forgotten: every block is written out afresh by the
 *  deterministic rules, the path an edited block takes, while the gaps between blocks and the
 *  constructs they came from stay known */
export function withoutOrigins(doc: PMNode): PMNode {
	const kids: PMNode[] = [];
	doc.forEach((child) => kids.push(forgetBlock(child)));
	const out = doc.type.create(doc.attrs, kids, doc.marks);
	const parse = parseOf(doc);
	if (parse) {
		const forgotten: ParseOrigins = { origins: [], tail: parse.tail, verbatim: false, from: parse.from, defects: parse.defects };
		for (const o of parse.origins) forgotten.origins.push({ ...o, parse: forgotten });
		docParses.set(out, forgotten);
	}
	return out;
}

/** what the parse knew about this very block, when it made it or a block equal to it */
export function blockOriginOf(node: PMNode): BlockOrigin | undefined {
	return blockOrigins.get(node);
}

/** every top-level block of `doc` against its parse: `origins[i]` is the parse's block that child i
 *  still is (the same node, or one equal to it standing in the parse's order); `was[i]` is the block
 *  child i most likely replaced, for a block that changed */
export type DocOrigins = { parse: ParseOrigins | null; origins: (BlockOrigin | null)[]; was: (BlockOrigin | null)[] };

// a node's gapAttrs say how it sits among its neighbours, which the gap around it writes, not its own bytes
function sameBytes(parsed: PMNode, node: PMNode): boolean {
	const gapAttrs: readonly string[] | undefined = parsed.type.spec.gapAttrs;
	if (!gapAttrs || parsed.type !== node.type) return parsed.eq(node);
	const attrs = { ...parsed.attrs };
	for (const name of gapAttrs) attrs[name] = node.attrs[name];
	return node.hasMarkup(parsed.type, attrs, parsed.marks) && parsed.content.eq(node.content);
}

export function originsOf(doc: PMNode, parse: ParseOrigins | null = parseOf(doc) ?? null): DocOrigins {
	const n = doc.childCount;
	const origins: (BlockOrigin | null)[] = new Array(n).fill(null);
	const was: (BlockOrigin | null)[] = new Array(n).fill(null);
	if (!parse) return { parse: null, origins, was };
	if (!docParses.has(doc)) docParses.set(doc, parse);
	for (let i = 0; i < n; i++) {
		const o = blockOrigins.get(doc.child(i));
		if (o && o.parse === parse) origins[i] = o;
	}
	// a block the parse does not know by node: the parse's next unclaimed block, when equal to it. An
	// edit leaves a new node with the old content (a letter typed and deleted, an undo), and equal
	// content came from the same bytes as far as writing them out is concerned
	let next = 0;
	for (let i = 0; i < n; i++) {
		const o = origins[i];
		if (o) {
			next = Math.max(next, o.index + 1);
			continue;
		}
		let limit = parse.origins.length;
		for (let j = i + 1; j < n; j++) {
			const a = origins[j];
			if (a) {
				limit = a.index;
				break;
			}
		}
		const child = doc.child(i);
		for (let k = next; k < limit; k++) {
			const c = parse.origins[k];
			if (!sameBytes(c.node, child)) continue;
			blockOrigins.set(child, c);
			origins[i] = c;
			next = k + 1;
			break;
		}
	}
	// blocks that changed, run by run between two known blocks: a leaf the edit left as it was still
	// says which bytes it came from, and the parse's block holding them is what the block replaced,
	// provided it lies between the known neighbours; failing that, when the counts agree, the run
	// stood for the parse's blocks between those
	let i = 0;
	while (i < n) {
		if (origins[i]) {
			i++;
			continue;
		}
		let j = i;
		while (j < n && !origins[j]) j++;
		const lo = i > 0 ? origins[i - 1]!.index : -1;
		const hi = j < n ? origins[j]!.index : parse.origins.length;
		let last = lo;
		for (let k = i; k < j; k++) {
			const at = firstLeafOffset(doc.child(k));
			const o = at === null ? null : originHolding(parse, at + parse.from, last + 1, hi);
			if (!o) continue;
			was[k] = o;
			last = o.index;
		}
		// between two blocks now placed, the ones still unplaced stood for the parse's blocks between
		// those when the counts agree
		let k = i;
		while (k < j) {
			if (was[k]) {
				k++;
				continue;
			}
			let m = k;
			while (m < j && !was[m]) m++;
			const a = k > i ? was[k - 1]!.index : lo;
			const b = m < j ? was[m]!.index : hi;
			// the same count, and the same kind of block at every place: a paragraph never stood for a heading
			let alike = b - a - 1 === m - k;
			for (let q = k; alike && q < m; q++) alike = parse.origins[a + 1 + (q - k)].node.type === doc.child(q).type;
			if (alike) for (let q = k; q < m; q++) was[q] = parse.origins[a + 1 + (q - k)];
			k = m;
		}
		i = j;
	}
	return { parse, origins, was };
}

/** the body offset the first recorded leaf of `node` came from, or null when no leaf remembers one */
function firstLeafOffset(node: PMNode): number | null {
	let found: number | null = null;
	node.descendants((n) => {
		if (found !== null) return false;
		const spans = spansOf(n);
		if (spans && spans.length > 0) found = spans[0].srcFrom;
		return found === null;
	});
	return found;
}

/** the parse's block whose bytes hold the file offset `at`, among those with index in [from, to) */
function originHolding(parse: ParseOrigins, at: number, from: number, to: number): BlockOrigin | null {
	for (let k = Math.max(0, from); k < Math.min(to, parse.origins.length); k++) {
		const o = parse.origins[k];
		if (o.srcFrom !== undefined && o.srcTo !== undefined && at >= o.srcFrom && at < o.srcTo) return o;
	}
	return null;
}
