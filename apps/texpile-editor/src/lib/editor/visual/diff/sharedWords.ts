// simplifyChanges widens a change to every word it touches, and a character diff of "the entropy" against "the
// measured entropy" touches "entropy" (its e matched one in "measured"), so the word read as replaced. Words the two
// sides still share at either end are given back
import type { Node as PMNode } from 'prosemirror-model';

export type DiffRange = { fromA: number; toA: number; fromB: number; toB: number };

/** each character of the range with its marks, when the range is plain text inside one textblock */
function plainText(doc: PMNode, from: number, to: number): string[] | null {
	const $from = doc.resolve(from);
	if (!$from.parent.isTextblock || to > $from.end()) return null;
	const chars: string[] = [];
	doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isText) return true;
		const marks = node.marks.map((m) => m.type.name + JSON.stringify(m.attrs)).join();
		for (const char of node.text!.slice(Math.max(0, from - pos), to - pos)) chars.push(char + marks);
		return false;
	});
	return chars.length === to - from ? chars : null;
}

function wordEdge(chars: string[], at: number): boolean {
	return at === 0 || at === chars.length || /^\s/.test(chars[at - 1]) || /^\s/.test(chars[at]);
}

export function withoutSharedWords(change: DiffRange, oldDoc: PMNode, newDoc: PMNode): DiffRange | null {
	const a = plainText(oldDoc, change.fromA, change.toA);
	const b = plainText(newDoc, change.fromB, change.toB);
	if (a === null || b === null) return change;
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	while (head > 0 && !(wordEdge(a, head) && wordEdge(b, head))) head--;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	while (tail > 0 && !(wordEdge(a, a.length - tail) && wordEdge(b, b.length - tail))) tail--;
	if (head === 0 && tail === 0) return change;
	const kept = { fromA: change.fromA + head, toA: change.toA - tail, fromB: change.fromB + head, toB: change.toB - tail };
	return kept.toA > kept.fromA || kept.toB > kept.fromB ? kept : null;
}

export function sharedWordsGivenBack(changes: readonly DiffRange[], oldDoc: PMNode, newDoc: PMNode): DiffRange[] {
	return changes.map((c) => withoutSharedWords(c, oldDoc, newDoc)).filter((c): c is DiffRange => c !== null);
}
