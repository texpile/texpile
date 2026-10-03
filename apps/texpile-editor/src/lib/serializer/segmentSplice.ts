// splicing the changed stretches of a block's leaves
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import type { Segment } from '$lib/editor/visual/sourceSpans';
import type { BlockOrigin } from '$lib/editor/visual/parseOrigins';
import type { BlockAssemblyOptions } from './blockAssembly';
import type { Splice, Spliced } from './blockAssemblyUtils';

/** the runs of the parsed leaf `then` at `thenPm` (relative to the parsed block), in order */
function leafRuns(origin: BlockOrigin, then: Node, thenPm: number): Segment[] {
	const from = origin.pmFrom + thenPm;
	const to = from + then.nodeSize;
	const out: Segment[] = [];
	for (const s of origin.leaves) if (s.pmFrom >= from && s.pmTo <= to) out.push(s);
	return out;
}

export function createSegmentSplice(options: BlockAssemblyOptions): Splice {
	/**
	 * A textblock whose inline content changed in more than leaf text (a mark toggled, a formula
	 * put in, a leaf split), written out as the bytes it came from with only the changed stretch
	 * written afresh: the unchanged inline nodes at either end keep their bytes, so do the
	 * unchanged characters at either end of a plain leaf the change reaches into, and the stretch
	 * between is rendered by the dialect and put in their place. The stretch is widened until it
	 * starts after and ends before plain text, so no mark's wrapper and no atom's delimiter is cut
	 * in half. Null when the block's bytes hold markup outside its leaves at an edge the stretch
	 * reaches, or the dialect cannot write the stretch on its own.
	 */
	function segmentSplice(node: Node, origin: BlockOrigin, ctx: Ctx, prefix = ''): Spliced | null {
		if (!options.inlineBytes || !origin.parse.verbatim || origin.text === undefined || origin.size !== 1) return null;
		const then = origin.node;
		if (!node.isTextblock || !then.isTextblock || !node.sameMarkup(then) || node === then) return null;
		const a: Node[] = [];
		const b: Node[] = [];
		then.forEach((c) => a.push(c));
		node.forEach((c) => b.push(c));
		// only a parsed leaf says where the inline content sits in the bytes: a block that had none
		// (a figure with no caption) may be nothing but frame
		if (a.length === 0) return null;
		function plain(n: Node | undefined) {
			return !!n && n.isText && n.marks.length === 0;
		}
		let p = 0;
		while (p < a.length && p < b.length && a[p].eq(b[p])) p++;
		let s = 0;
		while (s < a.length - p && s < b.length - p && a[a.length - 1 - s].eq(b[b.length - 1 - s])) s++;
		// a plain leaf the change reaches into keeps its unchanged characters at the edge, back to
		// the word boundary before the change: a mark's delimiter or a line break written mid-word
		// reads differently, and a stretch of nothing but a break is not written at all. The
		// boundary may lie in the plain leaf before, which is then taken in up to it
		let cut = 0;
		if (p < a.length - s && p < b.length - s && plain(a[p]) && plain(b[p])) {
			const x = a[p].text!;
			const y = b[p].text!;
			while (cut < x.length && cut < y.length && x[cut] === y[cut]) cut++;
		}
		function ws(ch: string) {
			return /\s/.test(ch);
		}
		// the cut moved back to the start of the word it is in; `extra` more words back when the
		// stretch would otherwise begin with a node that is not text (a break written alone reads
		// as nothing)
		function backToWord(extra: number) {
			let words = extra;
			for (;;) {
				if (cut > 0) {
					const x = a[p].text!;
					let w = cut;
					while (w > 0 && !ws(x[w - 1])) w--;
					while (words > 0 && w > 0) {
						while (w > 0 && ws(x[w - 1])) w--;
						while (w > 0 && !ws(x[w - 1])) w--;
						words--;
					}
					cut = w;
					if (cut > 0 || words === 0) break;
				}
				if (p === 0 || !plain(a[p - 1])) break;
				if (words === 0 && ws(a[p - 1].text!.slice(-1))) break;
				p--;
				cut = a[p].text!.length;
			}
		}
		backToWord(0);
		let ia = a.length - s - 1;
		let ib = b.length - s - 1;
		let cutEnd = 0;
		function endCut() {
			cutEnd = 0;
			if (ia >= p && ib >= p && plain(a[ia]) && plain(b[ib])) {
				const x = a[ia].text!;
				const y = b[ib].text!;
				const room = Math.min(x.length - (ia === p ? cut : 0), y.length - (ib === p ? cut : 0));
				while (cutEnd < room && x[x.length - 1 - cutEnd] === y[y.length - 1 - cutEnd]) cutEnd++;
			}
		}
		endCut();
		// the kept tail moved on to the start of the word it is in; `extra` more words on when the
		// stretch would otherwise end with a node that is not text
		function onToWord(extra: number) {
			let words = extra;
			for (;;) {
				if (cutEnd > 0) {
					const x = a[ia].text!;
					let w = x.length - cutEnd;
					while (w < x.length && !ws(x[w])) w++;
					while (words > 0 && w < x.length) {
						while (w < x.length && ws(x[w])) w++;
						while (w < x.length && !ws(x[w])) w++;
						words--;
					}
					cutEnd = x.length - w;
					if (cutEnd > 0 || words === 0) break;
				}
				const next = a[a.length - s];
				if (s === 0 || !plain(next)) break;
				if (words === 0 && ws(next.text![0])) break;
				s--;
				ia = a.length - s - 1;
				ib = b.length - s - 1;
				cutEnd = next.text!.length;
			}
		}
		onToWord(0);
		// an edge at a chip takes in a word on that side, unless kept space sits beside it (a line break after a label)
		const spaceBefore = cut === 0 && p > 0 && plain(a[p - 1]) && ws(a[p - 1].text!.slice(-1));
		const spaceAfter = cutEnd === 0 && s > 0 && plain(a[a.length - s]) && ws(a[a.length - s].text![0]);
		const firstNode = b[p] && b[p].isText && cut >= b[p].text!.length ? b[p + 1] : b[p];
		if (firstNode && !firstNode.isText && (cut > 0 || p > 0) && !spaceBefore) {
			backToWord(1);
			endCut();
			onToWord(0);
		}
		const lastNode = b[ib] && b[ib].isText && cutEnd >= b[ib].text!.length ? b[ib - 1] : b[ib];
		if (lastNode && !lastNode.isText && (cutEnd > 0 || s > 0) && !spaceAfter) onToWord(1);
		// the word moves can leave an edge of the stretch at a marked leaf, whose runs hold none of
		// its delimiters: cutting there would leave half a code span or an emphasis in the kept bytes
		while (cut === 0 && p > 0 && !plain(a[p - 1])) p--;
		while (cutEnd === 0 && s > 0 && !plain(a[a.length - s])) s--;
		ia = a.length - s - 1;
		ib = b.length - s - 1;
		const base = origin.srcFrom!;
		function pmOf(nodes: Node[], k: number): number {
			let at = 1;
			for (let i = 0; i < k; i++) at += nodes[i].nodeSize;
			return at;
		}
		/** the file offset of character `c` of the parsed leaf `a[k]`, when a run of its own bytes holds it */
		function byteAt(k: number, c: number): number | null {
			const leafPm = origin.pmFrom + pmOf(a, k);
			const runs = leafRuns(origin, a[k], pmOf(a, k));
			for (const r of runs) {
				if (r.kind === 'text' && leafPm + c >= r.pmFrom && leafPm + c <= r.pmTo) return r.srcFrom + (leafPm + c - r.pmFrom);
			}
			// a character written as something else (a line break read as a space) has its bytes' edges
			for (const r of runs) {
				if (leafPm + c === r.pmFrom) return r.srcFrom;
				if (leafPm + c === r.pmTo) return r.srcTo;
			}
			return null;
		}
		/** a boundary at where a character's own bytes begin moves back over the dialect's markup for
		 *  it (an escape), which no run covers and which belongs with the character */
		function charEdge(k: number, b: number | null): number | null {
			if (b === null) return null;
			let end = -1;
			for (const r of leafRuns(origin, a[k], pmOf(a, k))) {
				if (r.srcFrom < b && r.srcTo >= b) return b;
				if (r.srcTo <= b && r.srcTo > end) end = r.srcTo;
			}
			return end < 0 ? b : end;
		}
		// a leaf whose first character the dialect writes as more than itself carries that markup
		// before its own bytes, where no run reaches: the kept bytes cannot begin there
		function escapedHead(k: number): boolean {
			const leaf = a[k];
			if (!leaf || !leaf.isText || leaf.text!.length === 0 || !options.leafBytes) return false;
			const head = options.leafBytes(leaf.type.schema.text(leaf.text![0], leaf.marks), node, false, node);
			return head !== leaf.text![0];
		}
		// where the kept bytes end before the stretch and begin after it
		let start: number | null;
		if (cut > 0) start = charEdge(p, byteAt(p, cut));
		else if (p > 0) start = byteAt(p - 1, a[p - 1].nodeSize);
		else {
			const first = a.length > 0 ? leafRuns(origin, a[0], 1)[0] : undefined;
			start = a.length === 0 || (first && first.srcFrom === base) ? base : null;
		}
		let end: number | null;
		if (cutEnd > 0) end = charEdge(ia, byteAt(ia, a[ia].text!.length - cutEnd));
		else if (s > 0) end = escapedHead(a.length - s) ? null : byteAt(a.length - s, 0);
		else {
			const runs = a.length > 0 ? leafRuns(origin, a[a.length - 1], pmOf(a, a.length - 1)) : [];
			const last = runs[runs.length - 1];
			end = a.length === 0 || (last && last.srcTo === origin.srcTo) ? origin.srcTo! : null;
		}
		if (start === null || end === null || end < start) return null;
		// the stretch: the changed nodes, the remainders of the plain leaves at its edges first and last
		const stretch: Node[] = [];
		for (let k = p; k <= ib; k++) {
			let n = b[k];
			if (n.isText) {
				const from = k === p ? cut : 0;
				const to = n.text!.length - (k === ib ? cutEnd : 0);
				if (from >= to) continue;
				if (from > 0 || to < n.text!.length) n = n.type.schema.text(n.text!.slice(from, to), n.marks);
			}
			stretch.push(n);
		}
		const atStart = p === 0 && cut === 0;
		let bytes = stretch.length > 0 ? options.inlineBytes(node, stretch, atStart, ctx) : '';
		if (bytes === null) return null;
		// fresh bytes that would fuse with the bytes kept beside them are kept apart
		if (options.keepApart) {
			const apart = options.keepApart(
				bytes,
				origin.text.slice(end - base),
				origin.text.slice(0, start - base),
				origin.text.slice(start - base, end - base),
				node
			);
			if (apart === null) return null;
			bytes = apart;
		}
		// the fresh bytes' line ends continue the block as its container has them; the runs the
		// shadow finds in the bytes as written move past the prefixes put in
		const raw = bytes;
		if (prefix) bytes = raw.replace(/\n/g, '\n' + prefix);
		function prefixed(off: number): number {
			let moved = off;
			if (prefix) for (let i = 0; i < off && i < raw.length; i++) if (raw[i] === '\n') moved += prefix.length;
			return moved;
		}
		const text = origin.text.slice(0, start - base) + bytes + origin.text.slice(end - base);
		const delta = bytes.length - (end - start);
		const leaves: Segment[] = [];
		function keep(r: Segment, pmShift: number, srcShift: number) {
			return leaves.push({
				pmFrom: r.pmFrom - origin.pmFrom + pmShift,
				pmTo: r.pmTo - origin.pmFrom + pmShift,
				srcFrom: r.srcFrom - base + srcShift,
				srcTo: r.srcTo - base + srcShift,
				kind: r.kind
			});
		}
		for (let k = 0; k < p; k++) for (const r of leafRuns(origin, a[k], pmOf(a, k))) keep(r, 0, 0);
		if (cut > 0) {
			const leafPm = origin.pmFrom + pmOf(a, p);
			for (const r of leafRuns(origin, a[p], pmOf(a, p))) {
				if (r.pmTo <= leafPm + cut) keep(r, 0, 0);
				else if (r.pmFrom < leafPm + cut && r.kind === 'text')
					keep({ ...r, pmTo: leafPm + cut, srcTo: r.srcFrom + (leafPm + cut - r.pmFrom) }, 0, 0);
			}
		}
		const stretchPm = pmOf(b, p) + cut;
		if (stretch.length > 0) {
			for (const r of options.mapInlineLeaves?.(node, stretch, raw, atStart, ctx) ?? []) {
				leaves.push({
					pmFrom: stretchPm - 1 + r.pmFrom,
					pmTo: stretchPm - 1 + r.pmTo,
					srcFrom: start - base + prefixed(r.srcFrom),
					srcTo: start - base + prefixed(r.srcTo),
					kind: r.kind
				});
			}
		}
		if (cutEnd > 0) {
			const leafPm = origin.pmFrom + pmOf(a, ia);
			const from = leafPm + a[ia].text!.length - cutEnd;
			const shift = pmOf(b, ib) + b[ib].text!.length - (pmOf(a, ia) + a[ia].text!.length);
			for (const r of leafRuns(origin, a[ia], pmOf(a, ia))) {
				if (r.pmFrom >= from) keep(r, shift, delta);
				else if (r.pmTo > from && r.kind === 'text') keep({ ...r, pmFrom: from, srcFrom: r.srcFrom + (from - r.pmFrom) }, shift, delta);
			}
		}
		for (let k = a.length - s; k < a.length; k++) {
			const shift = pmOf(b, b.length - (a.length - k)) - pmOf(a, k);
			for (const r of leafRuns(origin, a[k], pmOf(a, k))) keep(r, shift, delta);
		}
		leaves.sort((x, y) => x.pmFrom - y.pmFrom);
		return { text, leaves, inner: [] };
	}

	return segmentSplice;
}
