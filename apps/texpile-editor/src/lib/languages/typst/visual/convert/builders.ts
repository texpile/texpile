// Typst-local ProseMirror builders, bound to typSchema. Same shape as markdown/builders.ts on
// purpose — each importer gets its own set because nodes from different Schema objects must
// never mix in one doc.
import { Node as PMNodeT, Mark as PMMarkT } from 'prosemirror-model';
import { typSchema } from '../schema';
import { concatSpans, noteSpans, spansOf, type LeafSpan } from '$lib/editor/visual/sourceSpans';

export type PmNode = PMNodeT;

/** A lightweight descriptor of a mark to apply; realised into a Mark at text-build time. */
export type PmMark = {
	type: string;
	attrs?: Record<string, unknown>;
};

/** Realise mark descriptors via Mark.addToSet (a raw .map() could produce duplicate same-type
 * marks, an invalid collection doc.check() rejects). */
export function realMarks(marks?: PmMark[] | null): readonly PMMarkT[] {
	if (!marks || marks.length === 0) return PMMarkT.none;
	let set: readonly PMMarkT[] = PMMarkT.none;
	for (const m of marks) set = typSchema.marks[m.type].create(m.attrs ?? null).addToSet(set);
	return set;
}

/** Build a real text node, or null for the empty string (PM forbids empty text). */
export function textNode(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PMNodeT | null {
	return text.length > 0 ? noteSpans(typSchema.text(text, realMarks(marks)), spans) : null;
}

/** Like `txt`, but returns a (possibly empty) array for handlers that return PmNode[]. */
export function textNodes(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PMNodeT[] {
	const t = textNode(text, marks, spans);
	return t ? [t] : [];
}

// createChecked in dev/tests: create validates attrs but NOT content placement, so a misplaced
// block parses and renders fine, then the FIRST structural edit throws and freezes ProseMirror.
// production stays lenient on purpose: a loose node should open degraded, not refuse to load.
const STRICT_NODES = import.meta.env.DEV || import.meta.env.MODE === 'test';

/** Build an element node; null/undefined children dropped. Checked in dev/tests (STRICT_NODES). */
export function buildNode(
	type: string,
	attrs?: Record<string, unknown> | null,
	content?: ReadonlyArray<PMNodeT | null | undefined> | null
): PMNodeT {
	const kids = (content ?? []).filter((c): c is PMNodeT => c != null);
	const nodeType = typSchema.nodes[type];
	if (STRICT_NODES) {
		try {
			return nodeType.createChecked(attrs ?? null, kids.length > 0 ? kids : undefined);
		} catch (e) {
			const shape = kids.map((k) => k.type.name).join(', ');
			throw new Error(`buildNode('${type}') built invalid content [${shape}]: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
		}
	}
	return nodeType.create(attrs ?? null, kids.length > 0 ? kids : undefined);
}

/** Merge adjacent same-mark text nodes into single runs (and drop empty text, which PM forbids). */
export function collapseTextNodes(nodes: PmNode[]): PmNode[] {
	if (nodes.length === 0) return nodes;

	const result: PmNode[] = [];
	let buf = '';
	let bufMarks: readonly PMMarkT[] = PMMarkT.none;
	let parts: { len: number; spans: LeafSpan[] | undefined }[] = [];
	function flush() {
		if (buf.length > 0) result.push(noteSpans(typSchema.text(buf, bufMarks), concatSpans(parts)));
		buf = '';
		bufMarks = PMMarkT.none;
		parts = [];
	}

	for (const node of nodes) {
		if (node.isText) {
			if (!node.text) continue; // PM forbids empty text; skip defensively
			if (buf.length > 0 && PMMarkT.sameSet(bufMarks, node.marks)) {
				buf += node.text;
			} else {
				flush();
				buf = node.text;
				bufMarks = node.marks;
			}
			parts.push({ len: node.text.length, spans: spansOf(node) });
		} else {
			flush();
			result.push(node);
		}
	}
	flush();
	return result;
}
