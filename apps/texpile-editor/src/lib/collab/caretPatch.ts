// a collaborator's change landed around the block being typed in. That block keeps what was typed
// unless their change is in it, and then takes only the stretch their change covers from the parse,
// so nothing a parse reads differently (two spaces typed in a row) moves under the caret
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { sourceToPm, type Segment, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { blockEq } from '$lib/editor/visual/blockPatch';
import { spliceDiff } from './spliceDiff';
import { carriedRuns } from './caretRuns';
import { diffInts } from '$lib/diff/iterables/diffIterableUtil';

/** a change between two texts, where it starts in each */
type NearChange = { oldIndex: number; remove: number; newIndex: number; insert: string };

// blocks either side searched for one that came through unchanged
const NEIGHBOURS = 4;

/** the caret block after a patch: its place among the top-level blocks, and its runs in the new text
 *  counted from its start (null when they could not be carried) */
export type CaretBlockPatched = { index: number; runs: Segment[] | null };

/** patches `tr` to `parsed`, the parse of `newSource`, around the caret's block; null, leaving `tr`
 *  untouched, when the parse does not hold that block where the change left it */
export function patchAroundCaret(
	tr: Transaction,
	parsed: PMNode,
	head: number,
	oldMap: SourceMap,
	newMap: SourceMap,
	oldSource: string,
	newSource: string
): CaretBlockPatched | null {
	const doc = tr.doc;
	if (head <= 0 || head >= doc.content.size) return null;
	const ci = doc.resolve(head).index(0);
	const caret = doc.child(ci);
	let from = 0;
	for (let i = 0; i < ci; i++) from += doc.child(i).nodeSize;
	const seg = oldMap.blocks.find((b) => b.pmFrom === from && b.pmTo === from + caret.nodeSize);
	const own = seg ? runsOf(oldMap, seg.pmFrom, seg.pmTo) : null;
	if (!seg || !own) return null;
	const [start, stop] = own;
	const near = changeNear(doc, ci, oldMap, oldSource, newSource);
	if (!near) return null;
	// a change that touches the block's text at all goes into it, never beside it: a block kept as it
	// was without their words would hand the next keystroke a text that deletes them
	const inside = widenedToRuns(
		near.changes.filter((c) => c.oldIndex + c.remove >= start && c.oldIndex <= stop),
		oldMap,
		newSource
	);
	if (inside.some((c) => c.oldIndex < start || c.oldIndex + c.remove > stop)) return null;
	let moved = near.shift;
	for (const c of near.changes) if (c.oldIndex + c.remove < start) moved += c.insert.length - c.remove;
	const at = newMap.blocks.find((b) => b.srcFrom === seg.srcFrom + moved);
	const cj = at ? childAt(parsed, at.pmFrom) : -1;
	if (cj < 0 || parsed.child(cj).type !== caret.type || at!.pmTo !== at!.pmFrom + parsed.child(cj).nodeSize) return null;
	// a re-parse of the same text keeps the block as typed only where the parse reads its spaces differently
	if (oldSource === newSource && (blockEq(caret, parsed.child(cj)) || inkOf(caret) !== inkOf(parsed.child(cj)))) return null;
	// kept as it was only when the parse's block is those same bytes: words appended to it are in it
	const theirs = runsOf(newMap, at!.pmFrom, at!.pmTo);
	if (!inside.length && (!theirs || theirs[0] !== start + moved || theirs[1] !== stop + moved)) return null;
	const stretches = stretchesOf(caret, from, parsed.child(cj), at!.pmFrom, inside, oldMap, newMap, parsed);
	if (!stretches) return null;
	const runs = carriedRuns(from, from + caret.nodeSize, oldMap, at!.pmFrom, at!.pmTo, newMap, stretches, inside, moved);
	replaceRun(tr, doc, parsed, ci + 1, doc.childCount, cj + 1, parsed.childCount);
	for (const s of [...stretches].reverse()) tr.replace(s.a, s.b, parsed.slice(s.c, s.d));
	replaceRun(tr, doc, parsed, 0, ci, 0, cj);
	return { index: cj, runs };
}

/** where `offset`, the caret's place in `oldSource`, stands in `newSource`: before words typed there */
export function carriedOffset(doc: PMNode, head: number, offset: number, oldMap: SourceMap, oldSource: string, newSource: string): number {
	const near = changeNear(doc, doc.resolve(head).index(0), oldMap, oldSource, newSource);
	const whole = spliceDiff(oldSource, newSource);
	const changes =
		near?.changes ?? (whole ? [{ oldIndex: whole.index, remove: whole.remove, newIndex: whole.index, insert: whole.insert }] : []);
	let carried = offset + (near?.shift ?? 0);
	for (const c of changes) {
		if (offset <= c.oldIndex) break;
		if (offset < c.oldIndex + c.remove) return c.newIndex + c.insert.length;
		carried += c.insert.length - c.remove;
	}
	return carried;
}

/**
 * The changes between the texts in block `ci`, bounded by the nearest block on either side whose
 * bytes came through unchanged: changes elsewhere in the file read as one stretch that covers the
 * block otherwise. `shift` is how far the text before them moved
 */
function changeNear(
	doc: PMNode,
	ci: number,
	oldMap: SourceMap,
	oldSource: string,
	newSource: string
): { shift: number; changes: NearChange[] } | null {
	// a re-parse of the same text (fresh stamps after typing) moves nothing
	const whole = spliceDiff(oldSource, newSource);
	if (!whole) return { shift: 0, changes: [] };
	const wholeEnd = whole.index + whole.remove;
	let lo: [number, number] = [0, 0];
	for (let i = ci - 1; i >= Math.max(0, ci - NEIGHBOURS); i--) {
		const r = blockRunsAt(doc, oldMap, i);
		if (!r) continue;
		if (r[1] <= whole.index) {
			lo = [r[1], r[1]];
			break;
		}
		const at = onceIn(newSource, oldSource.slice(r[0], r[1]), whole.index, whole.index + whole.insert.length);
		if (at >= 0) {
			lo = [r[1], at + r[1] - r[0]];
			break;
		}
	}
	let hi: [number, number] = [oldSource.length, newSource.length];
	for (let i = ci + 1; i < Math.min(doc.childCount, ci + 1 + NEIGHBOURS); i++) {
		const r = blockRunsAt(doc, oldMap, i);
		if (!r) continue;
		if (r[0] >= wholeEnd) {
			hi = [r[0], r[0] + whole.insert.length - whole.remove];
			break;
		}
		const at = onceIn(newSource, oldSource.slice(r[0], r[1]), whole.index, whole.index + whole.insert.length);
		if (at >= 0) {
			hi = [r[0], at];
			break;
		}
	}
	if (lo[0] > hi[0] || lo[1] > hi[1]) return null;
	const before = oldSource.slice(lo[0], hi[0]);
	const after = newSource.slice(lo[1], hi[1]);
	const shift = lo[1] - lo[0];
	const own = blockRunsAt(doc, oldMap, ci);
	const split = own ? splitAroundBlock(before, after, own[0] - lo[0], own[1] - lo[0]) : null;
	if (split) {
		const changes = split.changes.map((c) => ({ ...c, oldIndex: lo[0] + c.oldIndex, newIndex: lo[1] + c.newIndex }));
		return { shift: shift + split.shift, changes };
	}
	const d = spliceDiff(before, after);
	return { shift, changes: d ? [{ oldIndex: lo[0] + d.index, remove: d.remove, newIndex: lo[1] + d.index, insert: d.insert }] : [] };
}

// edits before the block only move it, and each edit in it is its own change: one splice over two people's
// edits around the caret carried the caret past the second one's words
function splitAroundBlock(before: string, after: string, start: number, stop: number): { shift: number; changes: NearChange[] } | null {
	let ranges;
	try {
		ranges = diffInts(codesOf(before), codesOf(after)).changes();
	} catch {
		return null;
	}
	let shift = 0;
	const changes: NearChange[] = [];
	for (const r of ranges) {
		if (r.end1 < start || abovePlaced(before, start, r, after)) shift += r.end2 - r.start2 - (r.end1 - r.start1);
		else if (r.start1 <= stop)
			changes.push({ oldIndex: r.start1, remove: r.end1 - r.start1, newIndex: r.start2, insert: after.slice(r.start2, r.end2) });
	}
	return { shift, changes };
}

// paragraphs added right above the block, which the diff reads as typed at its start
function abovePlaced(
	before: string,
	start: number,
	r: { start1: number; end1: number; start2: number; end2: number },
	after: string
): boolean {
	if (r.start1 !== start || r.end1 !== start) return false;
	let k = 0;
	while (k < r.end2 - r.start2 && k < start && after[r.end2 - 1 - k] === before[start - 1 - k]) k++;
	return /\n[ \t]*\n/.test(after.slice(r.end2 - k, r.end2));
}

function codesOf(text: string): Int32Array {
	const out = new Int32Array(text.length);
	for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
	return out;
}

// a change between the bytes of a run that stands for several (two spaces read as one) takes the whole run,
// and changes meeting in one run become one
function widenedToRuns(changes: NearChange[], map: SourceMap, newSource: string): NearChange[] {
	const out: NearChange[] = [];
	for (const c of changes) {
		const end = c.oldIndex + c.remove;
		let from = c.oldIndex;
		let to = end;
		for (const l of map.leaves) {
			if (l.kind === 'text' && l.pmTo - l.pmFrom === l.srcTo - l.srcFrom) continue;
			if (l.srcFrom < from && l.srcTo > from) from = l.srcFrom;
			if (l.srcFrom < to && l.srcTo > to) to = l.srcTo;
		}
		const last = out.at(-1);
		const joined = !!last && from <= last.oldIndex + last.remove;
		const oldIndex = joined ? last.oldIndex : from;
		const newIndex = joined ? last.newIndex : c.newIndex - (c.oldIndex - from);
		const stop = Math.max(to, joined ? last.oldIndex + last.remove : to);
		const merged = {
			oldIndex,
			remove: stop - oldIndex,
			newIndex,
			insert: newSource.slice(newIndex, c.newIndex + c.insert.length + (stop - end))
		};
		if (joined) out[out.length - 1] = merged;
		else out.push(merged);
	}
	return out;
}

// the text runs of top-level block `i`
function blockRunsAt(doc: PMNode, map: SourceMap, i: number): [number, number] | null {
	let pos = 0;
	for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
	return runsOf(map, pos, pos + doc.child(i).nodeSize);
}

// the bytes a block's text runs span, first to last
function runsOf(map: SourceMap, pmFrom: number, pmTo: number): [number, number] | null {
	const runs = map.leaves.filter((l) => l.pmFrom > pmFrom && l.pmTo < pmTo);
	if (runs.length === 0) return null;
	return [Math.min(...runs.map((l) => l.srcFrom)), Math.max(...runs.map((l) => l.srcTo))];
}

// where `text` stands in `source` between `from` and `to`, when it stands there exactly once
function onceIn(source: string, text: string, from: number, to: number): number {
	if (!text) return -1;
	const at = source.indexOf(text, from);
	if (at < 0 || at + text.length > to) return -1;
	const again = source.indexOf(text, at + 1);
	return again >= 0 && again + text.length <= to ? -1 : at;
}

function childAt(doc: PMNode, pos: number): number {
	let at = 0;
	for (let i = 0; i < doc.childCount; i++) {
		if (at === pos) return i;
		at += doc.child(i).nodeSize;
	}
	return -1;
}

/**
 * Where the changes sit in the caret block and in the parse's: taking those stretches from the parse
 * must leave a block that reads as the parse's, all but its whitespace, or a map did not place a
 * change exactly
 */
function stretchesOf(
	caret: PMNode,
	from: number,
	target: PMNode,
	targetFrom: number,
	changes: NearChange[],
	oldMap: SourceMap,
	newMap: SourceMap,
	parsed: PMNode
): { a: number; b: number; c: number; d: number }[] | null {
	const out: { a: number; b: number; c: number; d: number }[] = [];
	for (const change of changes) {
		const a = sourceToPm(oldMap.leaves, change.oldIndex, -1);
		const b = sourceToPm(oldMap.leaves, change.oldIndex + change.remove, 1);
		const c = sourceToPm(newMap.leaves, change.newIndex, -1);
		const d = sourceToPm(newMap.leaves, change.newIndex + change.insert.length, 1);
		if (a === null || b === null || c === null || d === null || b < a || d < c) return null;
		if (a <= from || b >= from + caret.nodeSize || c <= targetFrom || d >= targetFrom + target.nodeSize) return null;
		const last = out.at(-1);
		if (last && (a < last.b || c < last.d)) return null;
		out.push({ a, b, c, d });
	}
	try {
		let patched = caret;
		for (const s of [...out].reverse()) patched = patched.replace(s.a - from - 1, s.b - from - 1, parsed.slice(s.c, s.d));
		return out.length === 0 || inkOf(patched) === inkOf(target) ? out : null;
	} catch {
		return null;
	}
}

// what a block shows, whitespace aside: its characters with the marks on each, and its inline nodes
function inkOf(block: PMNode): string {
	let out = '';
	block.descendants((n) => {
		if (n.isText) {
			const marks = n.marks.map((m) => m.type.name + JSON.stringify(m.attrs)).join('+');
			for (const ch of (n.text ?? '').replace(/\s+/g, '')) out += `${marks}|${ch};`;
		} else if (n.isInline) out += `<${n.type.name}${JSON.stringify(n.attrs)}>`;
		else out += `[${n.type.name}]`;
		return true;
	});
	return out;
}

// the old children [first, last) made the parse's [firstNew, lastNew), less the equal blocks at either end
function replaceRun(tr: Transaction, doc: PMNode, parsed: PMNode, first: number, last: number, firstNew: number, lastNew: number): void {
	let [a0, a1, b0, b1] = [first, last, firstNew, lastNew];
	while (a0 < a1 && b0 < b1 && blockEq(doc.child(a0), parsed.child(b0))) {
		a0++;
		b0++;
	}
	while (a1 > a0 && b1 > b0 && blockEq(doc.child(a1 - 1), parsed.child(b1 - 1))) {
		a1--;
		b1--;
	}
	if (a0 === a1 && b0 === b1) return;
	let from = 0;
	for (let i = 0; i < a0; i++) from += doc.child(i).nodeSize;
	let to = from;
	for (let i = a0; i < a1; i++) to += doc.child(i).nodeSize;
	const nodes: PMNode[] = [];
	for (let i = b0; i < b1; i++) nodes.push(parsed.child(i));
	tr.replaceWith(from, to, nodes);
}
