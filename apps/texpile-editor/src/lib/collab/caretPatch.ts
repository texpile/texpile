// a collaborator's change landed around the block being typed in. That block keeps what was typed
// unless their change is in it, and then takes only the stretch their change covers from the parse,
// so nothing a parse reads differently (two spaces typed in a row) moves under the caret
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { sourceToPm, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { blockEq } from '$lib/editor/visual/blockPatch';
import { spliceDiff } from './spliceDiff';

/** a change between two texts, where it starts in each */
type NearChange = { oldIndex: number; remove: number; newIndex: number; insert: string };

// blocks either side searched for one that came through unchanged
const NEIGHBOURS = 4;

/** patches `tr` to `parsed`, the parse of `newSource`, around the caret's block; false, leaving `tr`
 *  untouched, when the parse does not hold that block where the change left it */
export function patchAroundCaret(
	tr: Transaction,
	parsed: PMNode,
	head: number,
	oldMap: SourceMap,
	newMap: SourceMap,
	oldSource: string,
	newSource: string
): boolean {
	const doc = tr.doc;
	if (oldSource === newSource || head <= 0 || head >= doc.content.size) return false;
	const ci = doc.resolve(head).index(0);
	const caret = doc.child(ci);
	let from = 0;
	for (let i = 0; i < ci; i++) from += doc.child(i).nodeSize;
	const seg = oldMap.blocks.find((b) => b.pmFrom === from && b.pmTo === from + caret.nodeSize);
	const own = seg ? runsOf(oldMap, seg.pmFrom, seg.pmTo) : null;
	if (!seg || !own) return false;
	const [start, stop] = own;
	const near = changeNear(doc, ci, oldMap, oldSource, newSource);
	if (!near) return false;
	const change = near.change;
	const end = change ? change.oldIndex + change.remove : 0;
	// a change that touches the block's text at all goes into it, never beside it: a block kept as it
	// was without their words would hand the next keystroke a text that deletes them
	const inside = !!change && end >= start && change.oldIndex <= stop;
	if (change && inside && (change.oldIndex < start || end > stop)) return false;
	const moved = near.shift + (change && end < start ? change.insert.length - change.remove : 0);
	const at = newMap.blocks.find((b) => b.srcFrom === seg.srcFrom + moved);
	const cj = at ? childAt(parsed, at.pmFrom) : -1;
	if (cj < 0 || parsed.child(cj).type !== caret.type || at!.pmTo !== at!.pmFrom + parsed.child(cj).nodeSize) return false;
	// kept as it was only when the parse's block is those same bytes: words appended to it are in it
	const theirs = runsOf(newMap, at!.pmFrom, at!.pmTo);
	if (!inside && (!theirs || theirs[0] !== start + moved || theirs[1] !== stop + moved)) return false;
	const stretch = inside ? stretchOf(caret, from, parsed.child(cj), at!.pmFrom, change!, oldMap, newMap, parsed) : null;
	if (inside && !stretch) return false;
	replaceRun(tr, doc, parsed, ci + 1, doc.childCount, cj + 1, parsed.childCount);
	if (stretch) tr.replace(stretch.a, stretch.b, parsed.slice(stretch.c, stretch.d));
	replaceRun(tr, doc, parsed, 0, ci, 0, cj);
	return true;
}

/** where `offset`, the caret's place in `oldSource`, stands in `newSource`: before words typed there */
export function carriedOffset(doc: PMNode, head: number, offset: number, oldMap: SourceMap, oldSource: string, newSource: string): number {
	const near = changeNear(doc, doc.resolve(head).index(0), oldMap, oldSource, newSource);
	const whole = spliceDiff(oldSource, newSource);
	const c =
		near?.change ?? (near || !whole ? null : { oldIndex: whole.index, remove: whole.remove, newIndex: whole.index, insert: whole.insert });
	const shift = near?.shift ?? 0;
	if (!c || offset <= c.oldIndex) return offset + shift;
	if (offset >= c.oldIndex + c.remove) return offset + shift + c.insert.length - c.remove;
	return c.newIndex + c.insert.length;
}

/**
 * The change between the texts around block `ci`, bounded by the nearest block on either side whose
 * bytes came through unchanged: changes elsewhere in the file read as one stretch that covers the
 * block otherwise. `shift` is how far the text before it moved; `change` is null when nothing
 * between the bounds changed
 */
function changeNear(
	doc: PMNode,
	ci: number,
	oldMap: SourceMap,
	oldSource: string,
	newSource: string
): { shift: number; change: NearChange | null } | null {
	// a re-parse of the same text (fresh stamps after typing) moves nothing
	const whole = spliceDiff(oldSource, newSource);
	if (!whole) return { shift: 0, change: null };
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
	const d = spliceDiff(oldSource.slice(lo[0], hi[0]), newSource.slice(lo[1], hi[1]));
	const shift = lo[1] - lo[0];
	return { shift, change: d ? { oldIndex: lo[0] + d.index, remove: d.remove, newIndex: lo[1] + d.index, insert: d.insert } : null };
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
 * Where the change sits in the caret block and in the parse's: taking that stretch from the parse
 * must leave a block that reads as the parse's, all but its whitespace, or a map did not place the
 * change exactly
 */
function stretchOf(
	caret: PMNode,
	from: number,
	target: PMNode,
	targetFrom: number,
	change: NearChange,
	oldMap: SourceMap,
	newMap: SourceMap,
	parsed: PMNode
): { a: number; b: number; c: number; d: number } | null {
	const a = sourceToPm(oldMap.leaves, change.oldIndex, -1);
	const b = sourceToPm(oldMap.leaves, change.oldIndex + change.remove, 1);
	const c = sourceToPm(newMap.leaves, change.newIndex, -1);
	const d = sourceToPm(newMap.leaves, change.newIndex + change.insert.length, 1);
	if (a === null || b === null || c === null || d === null || b < a || d < c) return null;
	if (a <= from || b >= from + caret.nodeSize || c <= targetFrom || d >= targetFrom + target.nodeSize) return null;
	try {
		const patched = caret.replace(a - from - 1, b - from - 1, parsed.slice(c, d));
		return inkOf(patched) === inkOf(target) ? { a, b, c, d } : null;
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
