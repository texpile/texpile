// the walk over a document's top-level blocks
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import { shiftSegment, type Segment, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { originsOf, parseOf, type BlockOrigin, type ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { BlockAssemblyOptions, DocSerializeResult, Neighbour } from './blockAssembly';
import {
	BLANK,
	WS,
	WS_END,
	brokenRuns,
	ctxFor,
	derivedInner,
	follows,
	isLastOfParse,
	nestedOf,
	optionChecks,
	placedRuns,
	rewrapLike,
	wrapsAsFile,
	type Entry,
	type Splice
} from './blockAssemblyUtils';
import type { createMemberSplice } from './memberSplice';
import type { createVerbatimParts } from './verbatimParts';

type AssemblyParts = { leafSplice: Splice; segmentSplice: Splice } & ReturnType<typeof createMemberSplice> &
	ReturnType<typeof createVerbatimParts>;

// the gaps at the body's edges belong to the body, not to the block standing there: a block written
// afresh at an edge, or put there in place of the one the file had, keeps the file's gap
function edgeGaps(neighbours: Neighbour[], parse: ParseOrigins | null): { leadGap: string | null; tailGap: string | null } {
	if (neighbours.length === 0) return { leadGap: null, tailGap: null };
	const first = neighbours[0].origin ?? neighbours[0].was ?? parse?.origins[0] ?? null;
	const lastN = neighbours[neighbours.length - 1];
	const last = lastN.origin ?? lastN.was ?? parse?.origins[parse.origins.length - 1] ?? null;
	return {
		leadGap: first && first.index === 0 && first.pre != null ? first.pre : null,
		tailGap: last && isLastOfParse(last) ? last.parse.tail : null
	};
}

function neighborKey(sib: Neighbour | null): string {
	if (!sib) return '';
	if (sib.node.type.name !== 'list') return sib.node.type.name;
	// the LaTeX list handler coalesces only within one source construct (see sameSourceList)
	const o = sib.origin;
	const edges = o ? `${o.member === 0 ? '<' : ''}${o.member === o.size - 1 ? '>' : ''}` : '';
	return `list:${String(sib.node.attrs.kind ?? '')}:${o ? String(o.index - o.member) : ''}${edges}`;
}

export function createDocAssembly(serializeNode: (node: Node, ctx: Ctx) => string, options: BlockAssemblyOptions, parts: AssemblyParts) {
	const { leafSplice, segmentSplice, frameSplice, constructSplice, verbatimRun, verbatimParts } = parts;
	const { joinedAround, ownBytes } = optionChecks(options);
	// per-block memo. PM nodes are immutable and structurally shared across transactions, so an
	// untouched top-level block keeps its object identity keystroke to keystroke: serializing the
	// whole doc becomes O(edited blocks), not O(doc). a block's output depends only on itself plus
	// the neighbour facts handlers read via prevSibling/nextSibling (heading adjacency for
	// paragraph, type+kind for list coalescing) — captured in `key`. if a handler ever reads more
	// of Ctx at the top level, widen the key.
	const blockCache = new WeakMap<Node, Entry>();

	function serializeTopBlock(doc: Node, i: number, n: number, neighbours: Neighbour[], afresh?: ReadonlySet<Node>): Entry {
		const node = doc.child(i);
		const whole = afresh?.has(node) ?? false;
		const key =
			neighborKey(i > 0 ? neighbours[i - 1] : null) + '>' + neighborKey(i < n - 1 ? neighbours[i + 1] : null) + (whole ? '!' : '');
		const hit = blockCache.get(node);
		if (hit && hit.key === key) return hit;
		const entry: Entry = { key, text: serializeNode(node, ctxFor(doc, i, n)) };
		// a container that changed inside keeps its frame and its untouched children as their bytes;
		// a block that changed in its text alone keeps everything but the leaves that changed;
		// a block to be written whole keeps nothing
		const replaced = whole || joinedAround(doc, i, i + 1) ? null : neighbours[i].was;
		const was = replaced && ownBytes(replaced) ? replaced : null;
		const spliced = was
			? (frameSplice(node, was, ctxFor(doc, i, n)) ??
				leafSplice(node, was, ctxFor(doc, i, n)) ??
				segmentSplice(node, was, ctxFor(doc, i, n)))
			: null;
		if (spliced) {
			const lead = /^[ \t\r\n]*/.exec(entry.text)![0];
			const trail = /[ \t\r\n]*$/.exec(entry.text)![0];
			entry.text = lead + spliced.text + trail;
			entry.leaves = spliced.leaves.map((s) => ({ ...s, srcFrom: s.srcFrom + lead.length, srcTo: s.srcTo + lead.length }));
			entry.inner = spliced.inner.map((s) => ({ ...s, srcFrom: s.srcFrom + lead.length, srcTo: s.srcTo + lead.length }));
		}
		blockCache.set(node, entry);
		return entry;
	}

	// the leaf runs of a regenerated block, told once per cache entry
	function leavesOf(doc: Node, i: number, n: number, entry: Entry): Segment[] {
		if (entry.leaves === undefined)
			// eslint-disable-next-line no-param-reassign -- the cache entry is where the runs are kept
			entry.leaves = options.mapLeaves ? options.mapLeaves(doc.child(i), ctxFor(doc, i, n), entry.text) : null;
		return entry.leaves ?? [];
	}

	/**
	 * `afresh` names top-level blocks to write out whole by the deterministic rules, whatever the
	 * parse knows of them: neither their bytes nor a splice inside them, only the file's gaps
	 * around them. The save check falls back to it for a block whose spliced bytes do not read
	 * back as the block (see verifiedSerialize)
	 */
	function serializeDocChildrenDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
		const n = doc.childCount;
		// the parse the document answers to; one handed in by the caller only stands in for a
		// document that remembers none
		const { parse: known, origins, was } = originsOf(doc, parseOf(doc) ?? parse ?? null);
		if (afresh) {
			for (let i = 0; i < n; i++) {
				if (!afresh.has(doc.child(i))) continue;
				was[i] = origins[i] ?? was[i];
				origins[i] = null;
			}
		}
		const neighbours: Neighbour[] = [];
		for (let i = 0; i < n; i++) neighbours.push({ node: doc.child(i), origin: origins[i], was: was[i] });
		const pmStarts: number[] = [];
		let pm = 0;
		for (let i = 0; i < n; i++) {
			pmStarts.push(pm);
			pm += doc.child(i).nodeSize;
		}
		// a block is rendered only once something asks for its text: a block written as its bytes
		// never is, so a document the parse still knows costs no rendering at all
		const entries: (Entry | undefined)[] = new Array<Entry | undefined>(n);
		function entryAt(i: number): Entry {
			return (entries[i] ??= serializeTopBlock(doc, i, n, neighbours, afresh));
		}
		function partAt(i: number): string {
			return entryAt(i).text;
		}
		// where a block's runs landed is remembered on the block, rendered or not
		function placedEntry(i: number): Entry {
			if (entries[i]) return entries[i]!;
			const node = doc.child(i);
			let entry = blockCache.get(node);
			if (!entry) {
				entry = { key: '', text: '' };
				blockCache.set(node, entry);
			}
			return entry;
		}
		// the output as the pieces it was written in, joined once at the end: a block's bytes, a
		// gap. Slicing and re-joining one string that grows with the document, block after
		// block, is what made writing a large document afresh quadratic
		const pieces: string[] = [];
		let outLen = 0;
		function push(s: string) {
			if (s === '') return;
			pieces.push(s);
			outLen += s.length;
		}
		// where the last block's own bytes end: a separator never cuts back into them
		let ownEnd = 0;
		function truncate(len: number) {
			ownEnd = Math.min(ownEnd, len);
			while (outLen > len && pieces.length > 0) {
				const last = pieces[pieces.length - 1];
				const over = outLen - len;
				if (over >= last.length) {
					pieces.pop();
					outLen -= last.length;
				} else {
					pieces[pieces.length - 1] = last.slice(0, last.length - over);
					outLen -= over;
				}
			}
		}
		/** the last `k` characters written */
		function tailText(k: number): string {
			let s = '';
			for (let p = pieces.length - 1; p >= 0 && s.length < k; p--) s = pieces[p].slice(-(k - s.length)) + s;
			return s;
		}
		const leaves: Segment[] = [];
		const blocks: Segment[] = [];
		// leaves land block by block: leafFrom[b] is where block segment b's leaves begin
		const leafFrom: number[] = [];
		const inner: Segment[] = [];
		const innerFrom: number[] = [];
		function cut(s: Segment, len: number): Segment {
			if (s.srcTo <= len) return s;
			const pmTo = s.kind === 'text' ? s.pmFrom + Math.max(0, len - s.srcFrom) : s.pmTo;
			return { pmFrom: s.pmFrom, pmTo, srcFrom: Math.min(s.srcFrom, len), srcTo: len, kind: s.kind };
		}
		// `out` is cut back before a separator goes on: nothing recorded may point past the cut, and a
		// text run loses as many characters as bytes. Blocks land in output order, so only the last
		// ones can reach past a cut
		function cutTo(len: number) {
			if (len >= outLen) return;
			for (let b = blocks.length - 1; b >= 0 && blocks[b].srcTo > len; b--) {
				blocks[b] = cut(blocks[b], len);
				const end = b + 1 < blocks.length ? leafFrom[b + 1] : leaves.length;
				for (let k = leafFrom[b]; k < end; k++) leaves[k] = cut(leaves[k], len);
				const innerEnd = b + 1 < blocks.length ? innerFrom[b + 1] : inner.length;
				for (let k = innerFrom[b]; k < innerEnd; k++) inner[k] = cut(inner[k], len);
			}
		}
		// the last verbatim-emitted child's origin; null once anything regenerated lands in between.
		// blocks serializing to '' (empty paragraphs) don't break the chain, so pristine neighbours
		// separated by a since-emptied paragraph still re-join on their original whitespace.
		let prevOrigin: BlockOrigin | null = null;
		// the last child that emitted anything, verbatim or not; what the boundary hook sees
		let last: Neighbour | null = null;
		let lastRegenerated: Neighbour | null = null;
		let leadProtected = false;
		let i = 0;
		// a pair still the source pair even when one of them changed: what the changed one replaced
		// stands in for it, since the bytes between them are the file's
		function dialectBoundary(next: Neighbour): string | null {
			if (!options.boundary || !last) return null;
			return options.boundary(last, next, follows(last.origin ?? last.was, next.origin ?? next.was), tailText(64));
		}
		// the file's gap between a pair still the source pair, when it holds a blank line: a
		// guaranteed parbreak, so a regenerated paragraph cannot merge into its neighbour across it.
		// Without one the gap is the dialect's, a single line end being no boundary for regenerated
		// prose
		function fileGap(prev: BlockOrigin | null, next: BlockOrigin | null): string | null {
			return follows(prev, next) && next!.pre != null && BLANK.test(next!.pre) ? next!.pre : null;
		}
		function trailingBreaks(): number {
			let count = 0;
			for (let p = pieces.length - 1; p >= 0; p--) {
				const s = pieces[p];
				let end = s.length;
				while (end > 0 && s[end - 1] === '\n') {
					end--;
					count++;
				}
				if (end > 0) break;
			}
			return count;
		}
		// what was written ends here, before the separator goes on: its trailing line ends go, and the
		// last block, when regenerated, gets its end fixed for what follows. A line end inside a
		// block's own bytes is not cut (a comment's slice ends on one); it counts against the
		// separator instead, which is why what is left of the separator comes back
		function beforeSeparator(sep: string, next: Neighbour): string {
			const breaks = trailingBreaks();
			const kept = Math.max(0, breaks - Math.max(0, outLen - ownEnd));
			truncate(outLen - (breaks - kept));
			const rest = kept > 0 ? sep.replace(/^\n+/, (nl) => nl.slice(Math.min(kept, nl.length))) : sep;
			if (lastRegenerated && options.beforeBreak && /\n[ \t]*\n/.test('\n'.repeat(kept) + rest) && pieces.length > 0) {
				const text = pieces[pieces.length - 1];
				const fixed = options.beforeBreak(text, lastRegenerated, next);
				if (fixed !== text) {
					pieces[pieces.length - 1] = fixed;
					outLen += fixed.length - text.length;
				}
			}
			cutTo(outLen);
			return rest;
		}
		while (i < n) {
			const found = verbatimRun(origins, i);
			const run = found > 0 && joinedAround(doc, i, i + found) ? 0 : found;
			if (run > 0) {
				const next = neighbours[i];
				const origin = origins[i]!;
				const contiguous = follows(prevOrigin, origin);
				let sep = '';
				if (outLen === 0) {
					// if the doc's first emission truly starts at the parse's block 0, its `pre` IS the
					// body's original leading gap; reproduce it before the generic trim can strip it.
					if (origin.index === 0 && origin.pre != null) {
						sep = origin.pre;
						leadProtected = true;
					}
				} else if (contiguous && origin.pre != null) {
					sep = origin.pre;
				} else {
					// after regenerated output: the dialect's boundary; else the file's own gap, when the
					// regenerated block stood in for the one the file had before this; else exactly one
					// blank line
					sep = beforeSeparator(fileGap(last?.was ?? null, origin) ?? dialectBoundary(next) ?? '\n\n', next);
				}
				const at = outLen + sep.length;
				const text = origin.text!;
				push(sep);
				push(text);
				ownEnd = outLen;
				// the block's runs are where they were at parse time, moved to where the slice landed
				let pmEnd = pmStarts[i];
				for (let k = 0; k < run; k++) pmEnd += doc.child(i + k).nodeSize;
				const members: Node[] = [];
				for (let k = 0; k < run; k++) members.push(doc.child(i + k));
				const placed = placedRuns(placedEntry(i), `v:${pmStarts[i]}:${at}:${run}`, members, () => {
					const block: Segment = { pmFrom: pmStarts[i], pmTo: pmEnd, srcFrom: at, srcTo: at + text.length, kind: 'sub' };
					const carried = origin.srcTo! - origin.srcFrom! === text.length && origin.pmTo - origin.pmFrom === pmEnd - pmStarts[i];
					const runs = carried ? origin.leaves.map((s) => shiftSegment(s, pmStarts[i] - origin.pmFrom, at - origin.srcFrom!)) : [];
					const nodes = members;
					const within = carried
						? nestedOf(nodes, origin.pmFrom).map((s) => shiftSegment(s, pmStarts[i] - origin.pmFrom, at - origin.srcFrom!))
						: [];
					return { block, leaves: runs, inner: within };
				});
				blocks.push(placed.block);
				leafFrom.push(leaves.length);
				for (const s of placed.leaves) leaves.push(s);
				innerFrom.push(inner.length);
				for (const s of placed.inner) inner.push(s);
				prevOrigin = origins[i + run - 1];
				last = neighbours[i + run - 1];
				lastRegenerated = null;
				i += run;
			} else {
				// a changed block that belongs to a construct the parse knew as several blocks is written
				// out with the whole construct, its frame and untouched items as the file's bytes
				const construct = afresh?.has(doc.child(i)) ? null : constructSplice(doc, i, neighbours);
				const count = construct ? construct.count : 1;
				let part = partAt(i);
				let partLeaves: Segment[] | null = null;
				let lead = '';
				if (!construct) {
					// a paragraph written afresh keeps the wrap the file gave the one it replaces
					const wrapWas = wrapsAsFile(doc.child(i), neighbours[i].was);
					const from = WS.exec(part)![0].length;
					const to = part.length - WS_END.exec(part)![0].length;
					const rewrapped = wrapWas && to > from ? rewrapLike(wrapWas, part.slice(from, to), options.endsLine) : null;
					if (rewrapped) {
						partLeaves = brokenRuns(
							leavesOf(doc, i, n, entryAt(i)),
							rewrapped.breaks.map((b) => b + from)
						);
						part = part.slice(0, from) + rewrapped.text + part.slice(to);
					}
				}
				if (construct) {
					lead = /^[ \t\r\n]*/.exec(part)![0];
					const trail = /[ \t\r\n]*$/.exec(partAt(i + count - 1))![0];
					part = lead + construct.text + trail;
					partLeaves = construct.leaves.map((s) => ({ ...s, srcFrom: s.srcFrom + lead.length, srcTo: s.srcTo + lead.length }));
				}
				if (part !== '') {
					const next = neighbours[i];
					const stripped = part.replace(/^\n+/, '');
					const sep = outLen === 0 ? null : (fileGap(prevOrigin ?? last?.was ?? null, next.was) ?? dialectBoundary(next));
					const gap = '\n'.repeat(trailingBreaks()) + /^\n*/.exec(part)![0];
					let between = '';
					let body = stripped;
					if (sep != null) {
						between = beforeSeparator(sep, next);
					} else if (prevOrigin != null) {
						between = '\n\n';
					} else if (gap.length > 1) {
						between = beforeSeparator(gap, next);
					} else {
						body = part;
					}
					// the doc's first emission: its lead goes now, where the final trim would take it
					if (outLen === 0 && between === '' && !leadProtected) body = body.replace(/^[ \t\r\n]+/, '');
					const at = outLen + between.length;
					push(between);
					push(body);
					const dropped = part.length - body.length;
					let pmEnd = pmStarts[i];
					for (let k = 0; k < count; k++) pmEnd += doc.child(i + k).nodeSize;
					const members: Node[] = [];
					for (let k = 0; k < count; k++) members.push(doc.child(i + k));
					const placed = placedRuns(entryAt(i), `r:${pmStarts[i]}:${at}:${dropped}:${count}`, members, () => {
						const block: Segment = { pmFrom: pmStarts[i], pmTo: pmEnd, srcFrom: at, srcTo: at + body.length, kind: 'sub' };
						const runs: Segment[] = [];
						for (const s of partLeaves ?? leavesOf(doc, i, n, entryAt(i))) {
							const srcTo = s.srcTo - dropped;
							if (srcTo <= 0) continue;
							runs.push({
								pmFrom: pmStarts[i] + s.pmFrom,
								pmTo: pmStarts[i] + s.pmTo,
								srcFrom: at + Math.max(0, s.srcFrom - dropped),
								srcTo: at + srcTo,
								kind: s.kind
							});
						}
						// the blocks inside: where a splice put them, else where their runs landed
						let within: Segment[];
						if (construct || entryAt(i).inner) {
							const known = construct ? construct.inner : entryAt(i).inner!;
							within = known.map((s) => ({
								pmFrom: pmStarts[i] + s.pmFrom,
								pmTo: pmStarts[i] + s.pmTo,
								srcFrom: at + Math.max(0, s.srcFrom + (construct ? lead.length : 0) - dropped),
								srcTo: at + Math.max(0, s.srcTo + (construct ? lead.length : 0) - dropped),
								kind: 'sub'
							}));
						} else within = derivedInner(doc.child(i), pmStarts[i], runs, at);
						return { block, leaves: runs, inner: within };
					});
					blocks.push(placed.block);
					leafFrom.push(leaves.length);
					for (const s of placed.leaves) leaves.push(s);
					innerFrom.push(inner.length);
					for (const s of placed.inner) inner.push(s);
					prevOrigin = null;
					last = neighbours[i + count - 1];
					lastRegenerated = last;
				}
				i += count;
			}
		}

		// the trailing gap after the ORIGINAL last block belongs to no node; reproduce it iff the
		// doc's actual last emission is still, unbroken, that same pristine block.
		let tailProtected = false;
		if (prevOrigin && isLastOfParse(prevOrigin) && prevOrigin.parse.tail != null) {
			push(prevOrigin.parse.tail);
			tailProtected = true;
		}
		let out = pieces.join('');

		// trim ONLY unprotected edges (identical to a blanket .trim() when no parse is known:
		// editor-created docs, direct converter callers). ascii whitespace only: a leading BOM or a
		// no-break space is content, not a gap
		if (!leadProtected) {
			const trimmed = out.replace(/^[ \t\r\n]+/, '');
			const cut = out.length - trimmed.length;
			if (cut > 0) {
				function shift(s: Segment): Segment {
					if (s.srcFrom >= cut) return { ...s, srcFrom: s.srcFrom - cut, srcTo: s.srcTo - cut };
					// the run began inside the trimmed lead
					const pmFrom = s.kind === 'text' ? s.pmFrom + Math.min(cut, s.srcTo) - s.srcFrom : s.pmFrom;
					return { ...s, pmFrom, srcFrom: 0, srcTo: Math.max(0, s.srcTo - cut) };
				}
				for (let k = 0; k < leaves.length; k++) leaves[k] = shift(leaves[k]);
				for (let k = 0; k < blocks.length; k++) blocks[k] = shift(blocks[k]);
			}
			out = trimmed;
			outLen = out.length;
		}
		if (!tailProtected) {
			out = out.replace(/[ \t\r\n]+$/, '');
			cutTo(out.length);
		}
		// runs land block by block in position order, so no sort is needed
		const map: SourceMap = {
			leaves: leaves.filter((s) => s.srcTo > s.srcFrom && s.pmTo > s.pmFrom),
			blocks: blocks.filter((s) => s.srcTo > s.srcFrom),
			inner: inner.filter((s) => s.pmTo > s.pmFrom)
		};
		return {
			text: out,
			leadProtected,
			tailProtected,
			...edgeGaps(neighbours, known),
			trailingRegenerated: tailProtected ? null : lastRegenerated,
			map
		};
	}

	return { serializeDocChildrenDetailed, verbatimParts };
}
