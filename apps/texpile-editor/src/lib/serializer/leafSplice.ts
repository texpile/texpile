// splicing a block whose leaf text alone changed
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import { spansOfChars, type CharSource, type LeafSpan, type Segment } from '$lib/editor/visual/sourceSpans';
import type { BlockOrigin } from '$lib/editor/visual/parseOrigins';
import type { BlockAssemblyOptions } from './blockAssembly';
import type { Splice, Spliced } from './blockAssemblyUtils';

type LeafPair = { now: Node; then: Node; parent: Node; nowPm: number; thenPm: number };

/** the text leaves of `now` beside those of `then`, when the two trees differ in leaf text alone */
function pairLeaves(now: Node, then: Node, parent: Node, nowPm: number, thenPm: number, out: LeafPair[]): boolean {
	if (!now.sameMarkup(then)) return false;
	if (now.isText) {
		out.push({ now, then, parent, nowPm, thenPm });
		return true;
	}
	if (now.childCount !== then.childCount) return false;
	let a = nowPm + 1;
	let b = thenPm + 1;
	for (let k = 0; k < now.childCount; k++) {
		if (!pairLeaves(now.child(k), then.child(k), now, a, b, out)) return false;
		a += now.child(k).nodeSize;
		b += then.child(k).nodeSize;
	}
	return true;
}

// the fresh bytes character by character, each the way it is written alone or escaped by a backslash
// (some escapes depend on the character after): an escape then stands for its one character, and the
// letters around it stay letters
function writtenChars(middle: string, bytes: string, write: (s: string, first: boolean) => string | null): CharSource[] | null {
	const chars: CharSource[] = [];
	let off = 0;
	for (const ch of middle) {
		const e = [write(ch, chars.length === 0), '\\' + ch, ch].find((c) => c !== null && bytes.startsWith(c, off));
		if (e === undefined || e === null) return null;
		for (let i = 0; i < ch.length; i++)
			chars.push(
				e === ''
					? null
					: e === ch
						? { srcFrom: off + i, srcTo: off + i + 1, kind: 'text' }
						: { srcFrom: off, srcTo: off + e.length, kind: 'sub' }
			);
		off += e.length;
	}
	return off === bytes.length ? chars : null;
}

export function createLeafSplice(options: BlockAssemblyOptions): Splice {
	/**
	 * A block whose shape the parse still knows, written out as the bytes it came from with only
	 * its changed text leaves written afresh in place: the wrapping, the markup between the
	 * leaves, and every untouched leaf stay the file's own. A changed leaf can be replaced only
	 * where its runs cover all its characters in file order; an accent or a ligature in it, or a
	 * leaf the parse could not place, leaves the block to the dialect's handler. Null when the
	 * trees differ in anything but leaf text. The runs are relative to the block node and its text.
	 */
	function leafSplice(node: Node, origin: BlockOrigin, ctx: Ctx, prefix = ''): Spliced | null {
		if (!options.leafBytes || !origin.parse.verbatim || origin.text === undefined || origin.size !== 1) return null;
		if (node === origin.node) return null;
		const pairs: LeafPair[] = [];
		if (!pairLeaves(node, origin.node, node, 0, 0, pairs)) return null;
		const base = origin.srcFrom!;
		function runsOf(p: LeafPair): Segment[] {
			const from = origin.pmFrom + p.thenPm;
			const to = from + p.then.nodeSize;
			const out: Segment[] = [];
			for (const s of origin.leaves) if (s.pmFrom >= from && s.pmTo <= to) out.push(s);
			return out;
		}
		type Change = {
			gone: string;
			srcFrom: number;
			srcTo: number;
			bytes: string;
			pair: LeafPair;
			exact: boolean;
			chars: CharSource[] | null;
			cut: number;
			cutEnd: number;
			runs: Segment[];
		};
		const changes: Change[] = [];
		for (const p of pairs) {
			if (p.now.text === p.then.text) continue;
			const runs = runsOf(p);
			if (runs.length === 0) return null;
			// every character placed, in file order, nothing of another leaf between
			let covered = 0;
			for (let k = 0; k < runs.length; k++) {
				const s = runs[k];
				if (s.pmFrom - (origin.pmFrom + p.thenPm) !== covered) return null;
				if (k > 0 && s.srcFrom < runs[k - 1].srcTo) return null;
				covered = s.pmTo - (origin.pmFrom + p.thenPm);
			}
			if (covered !== p.then.nodeSize) return null;
			// the characters unchanged at either end of the leaf keep their bytes (a hard wrap among
			// them); only what lies between is written afresh
			const x = p.then.text!;
			const y = p.now.text!;
			let cut = 0;
			while (cut < x.length && cut < y.length && x[cut] === y[cut]) cut++;
			let cutEnd = 0;
			while (cutEnd < Math.min(x.length, y.length) - cut && x[x.length - 1 - cutEnd] === y[y.length - 1 - cutEnd]) cutEnd++;
			const leafPm = origin.pmFrom + p.thenPm;
			function byteAt(c: number): number | null {
				for (const r of runs)
					if (r.kind === 'text' && leafPm + c >= r.pmFrom && leafPm + c <= r.pmTo) return r.srcFrom + (leafPm + c - r.pmFrom);
				return null;
			}
			// a cut inside a stand-in (an accent, a ligature) moves out to where the bytes are the characters
			while (cut > 0 && byteAt(cut) === null) cut--;
			while (cutEnd > 0 && byteAt(x.length - cutEnd) === null) cutEnd--;
			// the dialect's markup for a character (an escape) stands before it and no run covers it, so
			// a boundary at where the character's own bytes begin moves back over it, to where the
			// character before it ends
			function charEdge(b: number): number {
				let end = -1;
				for (const r of runs) {
					if (r.srcFrom < b && r.srcTo >= b) return b;
					if (r.srcTo <= b && r.srcTo > end) end = r.srcTo;
				}
				return end < 0 ? b : end;
			}
			// at the leaf's own start there is no character before it, and the markup of the block and
			// the escape of the first character cannot be told apart: the block is written afresh
			if (cut === 0 && x.length > 0) {
				const head = options.leafBytes(
					p.then.type.schema.text(x[0], p.then.marks),
					p.parent,
					p.parent === node && p.nowPm === 1,
					node,
					ctx
				);
				if (head === null || head !== x[0]) return null;
			}
			const from = cut > 0 ? charEdge(byteAt(cut)!) : runs[0].srcFrom;
			const to = cutEnd > 0 ? charEdge(byteAt(x.length - cutEnd)!) : runs[runs.length - 1].srcTo;
			const middle = y.slice(cut, y.length - cutEnd);
			function write(s: string, first: boolean) {
				return options.leafBytes!(
					p.now.type.schema.text(s, p.now.marks),
					p.parent,
					first && p.parent === node && p.nowPm === 1 && cut === 0,
					node,
					ctx
				);
			}
			// a leaf with more bytes than characters (a \ref chip's name) is left to the whole node's splice
			if (p.parent !== node && cut === 0 && cutEnd === 0 && write(x, true) !== origin.text.slice(from - base, to - base)) return null;
			let bytes = middle === '' ? '' : write(middle, true);
			if (bytes === null) return null;
			// the prefix goes in after every line end, which moves the bytes the characters stand for
			const chars = middle === '' || (prefix && bytes.includes('\n')) ? null : writtenChars(middle, bytes, write);
			// fresh bytes that would fuse with the bytes kept beside them are kept apart
			const gone = origin.text.slice(from - base, to - base);
			if (options.keepApart) {
				const apart = options.keepApart(bytes, origin.text.slice(to - base), origin.text.slice(0, from - base), gone, p.parent);
				if (apart === null) return null;
				bytes = apart;
			}
			if (prefix) bytes = bytes.replace(/\n/g, '\n' + prefix);
			changes.push({ srcFrom: from, srcTo: to, bytes, gone, pair: p, exact: bytes === middle, chars, cut, cutEnd, runs });
		}
		if (changes.length === 0) return null;
		changes.sort((a, b) => a.srcFrom - b.srcFrom);
		for (let k = 1; k < changes.length; k++) if (changes[k].srcFrom < changes[k - 1].srcTo) return null;
		// the text: the file's bytes with each changed leaf's range replaced
		let text = '';
		let cursor = base;
		function shifted(at: number): number {
			let d = 0;
			for (const c of changes) {
				if (c.srcTo <= at) d += c.bytes.length - (c.srcTo - c.srcFrom);
				else break;
			}
			return at + d;
		}
		for (const c of changes) {
			text += origin.text.slice(cursor - base, c.srcFrom - base) + c.bytes;
			cursor = c.srcTo;
		}
		text += origin.text.slice(cursor - base);
		// each change was kept apart from the file's bytes beside it; where another change moved
		// those, the seam is read again against what is written now
		if (options.keepApart && changes.length > 1) {
			for (const c of changes) {
				const at = shifted(c.srcFrom) - base;
				if (options.keepApart(c.bytes, text.slice(at + c.bytes.length), text.slice(0, at), c.gone, c.pair.parent) !== c.bytes) return null;
			}
		}
		// the runs: an untouched leaf's, moved to where its bytes and its node now are; a changed
		// leaf's is its new bytes whole
		const leaves: Segment[] = [];
		const changed = new Set(changes.map((c) => c.pair));
		for (const p of pairs) {
			if (changed.has(p)) continue;
			for (const s of runsOf(p)) {
				const pmFrom = p.nowPm + (s.pmFrom - (origin.pmFrom + p.thenPm));
				leaves.push({
					pmFrom,
					pmTo: pmFrom + (s.pmTo - s.pmFrom),
					srcFrom: shifted(s.srcFrom) - base,
					srcTo: shifted(s.srcTo) - base,
					kind: s.kind
				});
			}
		}
		// a changed leaf's: its kept head as it was, the fresh bytes whole, its kept tail moved by
		// the change; `d` is what the changes before this one moved the bytes by
		let d = 0;
		for (const c of changes) {
			const thenPm = origin.pmFrom + c.pair.thenPm;
			const nowPm = c.pair.nowPm;
			const x = c.pair.then.text!;
			const y = c.pair.now.text!;
			const headEnd = thenPm + c.cut;
			const tailStart = thenPm + x.length - c.cutEnd;
			const delta = c.bytes.length - (c.srcTo - c.srcFrom);
			for (const r of c.runs) {
				if (r.pmTo <= headEnd)
					leaves.push({
						pmFrom: r.pmFrom - thenPm + nowPm,
						pmTo: r.pmTo - thenPm + nowPm,
						srcFrom: r.srcFrom + d - base,
						srcTo: r.srcTo + d - base,
						kind: r.kind
					});
				else if (r.pmFrom < headEnd)
					leaves.push({
						pmFrom: r.pmFrom - thenPm + nowPm,
						pmTo: c.cut + nowPm,
						srcFrom: r.srcFrom + d - base,
						srcTo: c.srcFrom + d - base,
						kind: r.kind
					});
			}
			if (c.bytes.length > 0 && y.length - c.cutEnd > c.cut) {
				const whole: LeafSpan = {
					from: 0,
					to: y.length - c.cutEnd - c.cut,
					srcFrom: 0,
					srcTo: c.bytes.length,
					kind: c.exact ? 'text' : 'sub'
				};
				const at = c.srcFrom + d - base;
				for (const r of c.chars ? spansOfChars(c.chars) : [whole])
					leaves.push({
						pmFrom: nowPm + c.cut + r.from,
						pmTo: nowPm + c.cut + r.to,
						srcFrom: at + r.srcFrom,
						srcTo: at + r.srcTo,
						kind: r.kind
					});
			}
			const shift = y.length - x.length;
			for (const r of c.runs) {
				if (r.pmFrom >= tailStart)
					leaves.push({
						pmFrom: r.pmFrom - thenPm + nowPm + shift,
						pmTo: r.pmTo - thenPm + nowPm + shift,
						srcFrom: r.srcFrom + d + delta - base,
						srcTo: r.srcTo + d + delta - base,
						kind: r.kind
					});
				else if (r.pmTo > tailStart)
					leaves.push({
						pmFrom: x.length - c.cutEnd + nowPm + shift,
						pmTo: r.pmTo - thenPm + nowPm + shift,
						srcFrom: c.srcTo + d + delta - base,
						srcTo: r.srcTo + d + delta - base,
						kind: r.kind
					});
			}
			d += delta;
		}
		leaves.sort((a, b) => a.pmFrom - b.pmFrom);
		return { text, leaves, inner: [] };
	}

	return leafSplice;
}
