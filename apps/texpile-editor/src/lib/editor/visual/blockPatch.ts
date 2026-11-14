// Minimal top-level block patch between the mounted visual doc and a fresh re-parse of the same
// file: prefix/suffix trim finds the smallest child range to replace, comparing content but NOT
// the parse-time stamps (typst's source gap), which syncParseAttrs then adopts from the new parse
// everywhere, so the patched doc ends fully .eq to the parsed one while untouched blocks keep
// their node identity (NodeViews, decorations and the caret survive). Where the blocks came from
// is not an attr at all: the parse's origins are keyed by node (see sourceSpans).

import type { Node as PMNode } from 'prosemirror-model';
import { Fragment, Mark } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

export type BlockPatch = {
	/** replace [from, to) in the old doc ... */
	from: number;
	to: number;
	/** ... with these children of the new doc. */
	nodes: PMNode[];
};

// parse-time stamps the live doc never sets itself: typst's source gap, the source environment of a list item
const PARSE_STAMPS = new Set(['typGap', 'envKey']);

function attrsEqualExceptStamps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const ka = Object.keys(a).filter((k) => !PARSE_STAMPS.has(k));
	const kb = Object.keys(b).filter((k) => !PARSE_STAMPS.has(k));
	if (ka.length !== kb.length) return false;
	for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
	return true;
}

// the stamps live only on top-level blocks, so children compare with plain .eq
export function blockEq(a: PMNode, b: PMNode): boolean {
	return a.type === b.type && Mark.sameSet(a.marks, b.marks) && attrsEqualExceptStamps(a.attrs, b.attrs) && a.content.eq(b.content);
}

type BlockRange = [first: number, last: number];

// the blocks both ranges start with and end with: what differs is [start, endA) of the old and [startB, endB) of the new
function sharedEnds(oldDoc: PMNode, newDoc: PMNode, [a0, a1]: BlockRange, [b0, b1]: BlockRange) {
	let start = a0;
	let startB = b0;
	while (start < a1 && startB < b1 && blockEq(oldDoc.child(start), newDoc.child(startB))) {
		start++;
		startB++;
	}
	let endA = a1;
	let endB = b1;
	while (endA > start && endB > startB && blockEq(oldDoc.child(endA - 1), newDoc.child(endB - 1))) {
		endA--;
		endB--;
	}
	return { start, startB, endA, endB };
}

/** null when every block matches (stamps may still differ; run syncParseAttrs regardless). */
export function computeBlockPatch(oldDoc: PMNode, newDoc: PMNode): BlockPatch | null {
	const { start, endA, endB } = sharedEnds(oldDoc, newDoc, [0, oldDoc.childCount], [0, newDoc.childCount]);
	if (start === endA && start === endB) return null;
	let from = 0;
	for (let i = 0; i < start; i++) from += oldDoc.child(i).nodeSize;
	let to = from;
	for (let i = start; i < endA; i++) to += oldDoc.child(i).nodeSize;
	const nodes: PMNode[] = [];
	for (let i = start; i < endB; i++) nodes.push(newDoc.child(i));
	return { from, to, nodes };
}

// a changed stretch ends at the nearest pair of equal blocks this many blocks on, at most
const RESYNC_BLOCKS = 16;

/** The ranges to replace, in document order; none when every block matches. A change in several places (what an
 *  agent writes) leaves the blocks between them the nodes they were, where one range would rebuild them all. `blocks`
 *  and `newBlocks` narrow the comparison to a run of each document's children */
export function computeBlockPatches(
	oldDoc: PMNode,
	newDoc: PMNode,
	blocks: BlockRange = [0, oldDoc.childCount],
	newBlocks: BlockRange = [0, newDoc.childCount]
): BlockPatch[] {
	const { start, startB, endA, endB } = sharedEnds(oldDoc, newDoc, blocks, newBlocks);
	// the nearest equal pair past (i, j), one changed block before one added or dropped
	function resync(i: number, j: number): [number, number] {
		for (let d = 1; d <= RESYNC_BLOCKS; d++) {
			for (let skew = d % 2; skew <= d; skew += 2) {
				for (const di of skew ? [(d - skew) / 2, (d + skew) / 2] : [d / 2]) {
					const dj = d - di;
					if (i + di < endA && j + dj < endB && blockEq(oldDoc.child(i + di), newDoc.child(j + dj))) return [i + di, j + dj];
				}
			}
		}
		return [endA, endB];
	}
	const patches: BlockPatch[] = [];
	let at = 0;
	for (let i = 0; i < start; i++) at += oldDoc.child(i).nodeSize;
	let i = start;
	let j = startB;
	while (i < endA || j < endB) {
		const [toI, toJ] = resync(i, j);
		const patch: BlockPatch = { from: at, to: at, nodes: [] };
		for (; i < toI; i++) patch.to += oldDoc.child(i).nodeSize;
		for (; j < toJ; j++) patch.nodes.push(newDoc.child(j));
		patches.push(patch);
		at = patch.to;
		for (; i < endA && j < endB && blockEq(oldDoc.child(i), newDoc.child(j)); i++, j++) at += oldDoc.child(i).nodeSize;
	}
	return patches;
}

/** the node with its LAST descendant text's trailing spaces/tabs removed; null when it was only
 *  whitespace text. Descends through the last child so a list's final item trims too. */
function trimTrailingWs(node: PMNode): PMNode | null {
	if (node.isText) {
		const trimmed = (node.text ?? '').replace(/[ \t]+$/, '');
		if (trimmed === node.text) return node;
		return trimmed ? (node as PMNode & { withText(t: string): PMNode }).withText(trimmed) : null;
	}
	if (node.childCount === 0) return node;
	const kids: PMNode[] = [];
	for (let i = 0; i < node.childCount - 1; i++) kids.push(node.child(i));
	const last = trimTrailingWs(node.child(node.childCount - 1));
	if (last) kids.push(last);
	return node.copy(Fragment.fromArray(kids));
}

/** a textblock holding nothing, or only whitespace text (a paragraph mid-creation) */
function isWhitespaceOnlyTextblock(node: PMNode): boolean {
	if (!node.isTextblock) return false;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isText || /\S/.test(c.text ?? '')) return false;
	}
	return true;
}

/**
 * The block being TYPED IN must survive a re-parse of the serialized source. Serialize->parse is
 * lossy exactly at a block's in-progress tail — every dialect's parser drops trailing inline
 * whitespace, and a whitespace-only paragraph serializes to nothing at all — so the collab
 * re-parse (VisualCollab.runRemotePatch) would otherwise clobber what the user just typed: the
 * trailing space vanishes under the caret, and a freshly opened paragraph is deleted outright.
 *
 * Returns `newDoc` with the caret's top-level block grafted back in when its only divergence from
 * the parse is that insignificant tail (content stays live, attrs adopt the parse's), or with the
 * dropped whitespace-only block re-inserted. Anything structurally different — including every
 * genuine remote edit to that block — passes through untouched. Only trailing-whitespace loss in
 * the caret block is shielded, so a real remote deletion of other text still applies.
 */
export function protectCaretBlock(oldDoc: PMNode, newDoc: PMNode, head: number): PMNode {
	if (head < 0 || head > oldDoc.content.size || oldDoc.childCount === 0) return newDoc;
	const ci = oldDoc.resolve(head).index(0);
	if (ci >= oldDoc.childCount) return newDoc;
	const oldB = oldDoc.child(ci);
	// indices only correspond while everything before the caret block matches both docs
	for (let i = 0; i < ci; i++) {
		if (i >= newDoc.childCount || !blockEq(oldDoc.child(i), newDoc.child(i))) return newDoc;
	}
	// The serializer dropped a whitespace-only caret block entirely: put it back. Keyed on the
	// block AT the caret index rather than on child counts, because the parse may come back the
	// same length anyway (normalization appends a trailing paragraph where the dropped block was
	// removed mid-doc). Skipped when the parse kept a matching whitespace-only block there.
	if (isWhitespaceOnlyTextblock(oldB)) {
		const kept = ci < newDoc.childCount && newDoc.child(ci).type === oldB.type && isWhitespaceOnlyTextblock(newDoc.child(ci));
		if (!kept && newDoc.childCount <= oldDoc.childCount) {
			const kids: PMNode[] = [];
			for (let i = 0; i < newDoc.childCount; i++) {
				if (i === ci) kids.push(oldB);
				kids.push(newDoc.child(i));
			}
			if (ci >= newDoc.childCount) kids.push(oldB);
			return newDoc.copy(Fragment.fromArray(kids));
		}
	}
	if (newDoc.childCount !== oldDoc.childCount) return newDoc;
	const newB = newDoc.child(ci);
	if (blockEq(oldB, newB)) return newDoc;
	if (oldB.type !== newB.type || !Mark.sameSet(oldB.marks, newB.marks) || !attrsEqualExceptStamps(oldB.attrs, newB.attrs)) return newDoc;
	const trimmed = trimTrailingWs(oldB);
	if (!trimmed || !trimmed.content.eq(newB.content)) return newDoc;
	// graft: keep the live content (with its trailing whitespace), adopt the parse's attrs
	const kids: PMNode[] = [];
	for (let i = 0; i < newDoc.childCount; i++) {
		kids.push(i === ci ? newB.type.create(newB.attrs, oldB.content, oldB.marks) : newDoc.child(i));
	}
	return newDoc.copy(Fragment.fromArray(kids));
}

/** after the replace, restamp kept blocks whose attrs went stale with the new parse's truth;
 *  attr-only steps, so no content or DOM churn. The doc node's own attrs (a file's line ending)
 *  sync the same way. */
export function syncParseAttrs(tr: Transaction, newDoc: PMNode): void {
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
