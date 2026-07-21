// Minimal top-level block patch between the mounted visual doc and a fresh re-parse of the same
// file: prefix/suffix trim finds the smallest child range to replace, comparing content but NOT
// the orig verbatim attrs (a remote edit shifts every later block's orig.start, so attr-strict
// equality would see the whole tail as changed). syncOrigAttrs then adopts the new parse's orig
// stamps everywhere, so the patched doc ends fully .eq to the parsed one while untouched blocks
// keep their node identity (NodeViews, decorations and the caret survive).

import type { Node as PMNode } from 'prosemirror-model';
import { Mark } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

export interface BlockPatch {
	/** replace [from, to) in the old doc ... */
	from: number;
	to: number;
	/** ... with these children of the new doc. */
	nodes: PMNode[];
}

function attrsEqualExceptOrig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const ka = Object.keys(a).filter((k) => k !== 'orig');
	const kb = Object.keys(b).filter((k) => k !== 'orig');
	if (ka.length !== kb.length) return false;
	for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
	return true;
}

// orig lives only on top-level blocks, so children compare with plain .eq
function blockEq(a: PMNode, b: PMNode): boolean {
	return a.type === b.type && Mark.sameSet(a.marks, b.marks) && attrsEqualExceptOrig(a.attrs, b.attrs) && a.content.eq(b.content);
}

/** null when every block matches (orig attrs may still differ; run syncOrigAttrs regardless). */
export function computeBlockPatch(oldDoc: PMNode, newDoc: PMNode): BlockPatch | null {
	const a = oldDoc.childCount;
	const b = newDoc.childCount;
	let start = 0;
	while (start < a && start < b && blockEq(oldDoc.child(start), newDoc.child(start))) start++;
	let endA = a;
	let endB = b;
	while (endA > start && endB > start && blockEq(oldDoc.child(endA - 1), newDoc.child(endB - 1))) {
		endA--;
		endB--;
	}
	if (start === endA && start === endB) return null;
	let from = 0;
	for (let i = 0; i < start; i++) from += oldDoc.child(i).nodeSize;
	let to = from;
	for (let i = start; i < endA; i++) to += oldDoc.child(i).nodeSize;
	const nodes: PMNode[] = [];
	for (let i = start; i < endB; i++) nodes.push(newDoc.child(i));
	return { from, to, nodes };
}

/** after the replace, restamp kept blocks whose attrs (orig.start, seq, group ids) went stale
 *  with the new parse's truth; attr-only steps, so no content or DOM churn. The doc node itself
 *  carries verbatim state too (docTail), so it syncs the same way. */
export function syncOrigAttrs(tr: Transaction, newDoc: PMNode): void {
	const doc = tr.doc;
	if (doc.childCount !== newDoc.childCount) return; // structural drift; the next full parse settles it
	for (const k of Object.keys(newDoc.attrs)) {
		if (JSON.stringify(doc.attrs[k]) !== JSON.stringify(newDoc.attrs[k])) tr.setDocAttribute(k, newDoc.attrs[k]);
	}
	let pos = 0;
	for (let i = 0; i < doc.childCount; i++) {
		const cur = doc.child(i);
		const want = newDoc.child(i);
		if (cur.type === want.type && JSON.stringify(cur.attrs) !== JSON.stringify(want.attrs)) {
			tr.setNodeMarkup(pos, null, want.attrs, cur.marks);
		}
		pos += cur.nodeSize;
	}
}
