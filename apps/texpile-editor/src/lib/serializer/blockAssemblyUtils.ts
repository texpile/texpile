// helpers shared by the block assembly
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import { isContainer, type Segment } from '$lib/editor/visual/sourceSpans';
import { containerOriginsOf, type BlockOrigin } from '$lib/editor/visual/parseOrigins';
import type { BlockAssemblyOptions } from './blockAssembly';

/** whether `bytes` between the file's `head` and `tail` leave a blank line: its line ends meeting each other, or one of the bytes */
export function blankLineAt(head: string, bytes: string, tail: string): boolean {
	return /\n[ \t]*\n/.test(/[ \t\n]*$/.exec(head)![0] + bytes + /^[ \t\n]*/.exec(tail)![0]);
}

/** the parse's last block, which the body's trailing gap follows */
export function isLastOfParse(o: BlockOrigin): boolean {
	return o.index === o.parse.origins.length - 1;
}

/** whether `next` directly followed `prev` in the parse's order */
export function follows(prev: BlockOrigin | null, next: BlockOrigin | null): boolean {
	return !!prev && !!next && prev.parse === next.parse && next.index === prev.index + 1;
}

export type Placed = { key: string; nodes: Node[]; block: Segment; leaves: Segment[]; inner: Segment[] };
export type Entry = { key: string; text: string; leaves?: Segment[] | null; inner?: Segment[] | null; placed?: Placed };
/** what a splice hands back: the bytes, the leaf runs in them, and the range of every block below
 *  the top level in them, all relative to the text and to the first node */
export type Spliced = { text: string; leaves: Segment[]; inner: Segment[] };
export type Splice = (node: Node, origin: BlockOrigin, ctx: Ctx, prefix?: string) => Spliced | null;

// a block's placed runs are the same objects call after call while it lands at the same place;
// nothing changes them in place, so sharing them is safe. The runs of a construct of several
// blocks are kept on its first, and believed only while every block is the one they were made
// for: the first item of a list is untouched by an edit to its third, which lands at the same place
export function placedRuns(
	entry: Entry,
	key: string,
	nodes: Node[],
	make: () => { block: Segment; leaves: Segment[]; inner: Segment[] }
): Placed {
	const hit = entry.placed;
	if (hit && hit.key === key && hit.nodes.length === nodes.length && hit.nodes.every((n, k) => n === nodes[k])) return hit;
	const placed: Placed = { key, nodes, ...make() };
	// eslint-disable-next-line no-param-reassign -- the cache entry is where the runs are kept
	entry.placed = placed;
	return placed;
}

export function ctxFor(doc: Node, i: number, n: number): Ctx {
	return { parent: doc, index: i, isLastChild: i === n - 1, inTableCell: false };
}

// prosemirror-tables tags the cell nodes; a dialect writes a line break and a paragraph's end
// differently inside one, so a child of a cell inherits the flag its container's own handler sets
export function inCell(node: Node): boolean {
	const role = node.type.spec.tableRole;
	return role === 'cell' || role === 'header_cell';
}

export const WS = /^[ \t\r\n]*/;
export const WS_END = /[ \t\r\n]*$/;
export const BLANK = /\n[ \t]*\n/;

/**
 * A paragraph written afresh, wrapped as the file wrapped the paragraph it replaces: the file's
 * line breaks are gone with the bytes, but their width is not, and a paragraph filled to it
 * keeps the file's shape, so the change reads as the words that changed. A space becomes a line
 * break only before a word that begins with a letter, which no dialect reads as markup at a line
 * start; `breaks` are the offsets of the spaces so replaced. Null when the file's paragraph was
 * one line, or when the fresh text has line breaks of its own (a comment, a forced break)
 */
export function rewrapLike(was: string, fresh: string): { text: string; breaks: number[] } | null {
	if (fresh.includes('\n')) return null;
	const lines = was.split('\n');
	if (lines.length < 2) return null;
	const width = Math.max(...lines.map((l, k) => (k === 0 ? l : l.replace(/^[ \t>]*/, '')).replace(/\s+$/, '').length));
	if (width < 8) return null;
	let out = '';
	let lineLen = -1;
	const breaks: number[] = [];
	for (const word of fresh.split(' ')) {
		if (lineLen < 0) {
			out = word;
			lineLen = word.length;
			continue;
		}
		if (lineLen > 0 && lineLen + 1 + word.length > width && /^\p{L}/u.test(word)) {
			breaks.push(out.length);
			out += '\n' + word;
			lineLen = word.length;
		} else {
			out += ' ' + word;
			lineLen += 1 + word.length;
		}
	}
	return breaks.length > 0 ? { text: out, breaks } : null;
}

/** the runs of a text after spaces at `breaks` became line breaks: the character stands for a byte it no longer is */
export function brokenRuns(runs: Segment[], breaks: number[]): Segment[] {
	if (breaks.length === 0) return runs;
	const out: Segment[] = [];
	for (const r of runs) {
		if (r.kind !== 'text') {
			out.push(r);
			continue;
		}
		let from = r.srcFrom;
		for (const b of breaks) {
			if (b < from || b >= r.srcTo) continue;
			if (b > from)
				out.push({ pmFrom: r.pmFrom + (from - r.srcFrom), pmTo: r.pmFrom + (b - r.srcFrom), srcFrom: from, srcTo: b, kind: 'text' });
			out.push({ pmFrom: r.pmFrom + (b - r.srcFrom), pmTo: r.pmFrom + (b - r.srcFrom) + 1, srcFrom: b, srcTo: b + 1, kind: 'sub' });
			from = b + 1;
		}
		if (from < r.srcTo) out.push({ pmFrom: r.pmFrom + (from - r.srcFrom), pmTo: r.pmTo, srcFrom: from, srcTo: r.srcTo, kind: 'text' });
	}
	return out;
}

export function wrapsAsFile(node: Node, was: BlockOrigin | null): string | null {
	return was && node.type.name === 'paragraph' && was.node.type.name === 'paragraph' && was.text !== undefined && was.text.includes('\n')
		? was.text
		: null;
}

/** the parse index of the last kept or changed slot before `slot`, or -1 */
export function lastIndexBefore(slots: { ref: BlockOrigin | null }[], slot: { ref: BlockOrigin | null }): number {
	let last = -1;
	for (const s of slots) {
		if (s === slot) break;
		if (s.ref) last = s.ref.index;
	}
	return last;
}

/** the range of every block below the top level inside `nodes`, as the parse placed them, in the
 *  parse's own coordinates; `pmStart` is where the first node stood */
export function nestedOf(nodes: Node[], pmStart: number): Segment[] {
	const out: Segment[] = [];
	let at = pmStart;
	for (const node of nodes) {
		function walk(container: Node, pos: number) {
			const rec = containerOriginsOf(container);
			if (rec) {
				for (let k = 0; k < rec.origins.length; k++) {
					const o = rec.origins[k];
					if (o.member !== 0 || o.srcFrom === undefined) continue;
					const end = rec.origins[Math.min(k + o.size, rec.origins.length) - 1];
					out.push({ pmFrom: o.pmFrom, pmTo: end.pmTo, srcFrom: o.srcFrom, srcTo: o.srcTo!, kind: 'sub' });
				}
			}
			let childPos = pos + 1;
			container.forEach((child) => {
				if (isContainer(child)) walk(child, childPos);
				childPos += child.nodeSize;
			});
		}
		if (isContainer(node)) walk(node, at);
		at += node.nodeSize;
	}
	return out;
}

/** the range of every block below the top level inside `node`, told by the runs that landed in
 *  it: from its first run to its last; one with no runs stands where the block before it ended,
 *  or at its container's start. `runs` are in the same coordinates as `pmStart` and `srcStart` */
export function derivedInner(node: Node, pmStart: number, runs: Segment[], srcStart: number): Segment[] {
	const out: Segment[] = [];
	const sorted = [...runs].sort((a, b) => a.pmFrom - b.pmFrom);
	function walk(container: Node, contentPos: number, containerSrc: number) {
		let pos = contentPos;
		let prevEnd = containerSrc;
		container.forEach((child) => {
			const from = pos;
			const to = pos + child.nodeSize;
			let lo = Infinity;
			let hi = -Infinity;
			for (const r of sorted) {
				if (r.pmFrom >= to) break;
				if (r.pmFrom >= from && r.pmTo <= to) {
					lo = Math.min(lo, r.srcFrom);
					hi = Math.max(hi, r.srcTo);
				}
			}
			const seg: Segment =
				lo <= hi
					? { pmFrom: from, pmTo: to, srcFrom: lo, srcTo: hi, kind: 'sub' }
					: { pmFrom: from, pmTo: to, srcFrom: prevEnd, srcTo: prevEnd, kind: 'sub' };
			out.push(seg);
			prevEnd = seg.srcTo;
			if (isContainer(child)) walk(child, from + 1, seg.srcFrom);
			pos = to;
		});
	}
	if (isContainer(node)) walk(node, pmStart + 1, srcStart);
	return out;
}

export function optionChecks(options: BlockAssemblyOptions) {
	/** whether the block before `parent`'s children `from` up to `to`, or the one after, is written into the construct they make */
	function joinedAround(parent: Node, from: number, to: number): boolean {
		const joins = options.continues;
		return !!joins && ((from > 0 && joins(parent, from)) || (to < parent.childCount && joins(parent, to)));
	}

	function ownBytes(origin: BlockOrigin): boolean {
		return !options.standsAlone || options.standsAlone(origin.node);
	}

	return { joinedAround, ownBytes };
}
