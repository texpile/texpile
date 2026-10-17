// low-level ProseMirror builders + shared types for the LaTeX to editor converter.
import type { Node } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { Node as PMNodeT, Mark as PMMarkT } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { concatSpans, noteSpans, spansOf, type LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { PackageTable } from './signatures/packageTable';

export type PmNode = PMNodeT;

/** A lightweight descriptor of a mark to apply; realised into a Mark at text-build time. */
export type PmMark = {
	type: string;
	attrs?: Record<string, unknown>;
};

export type ConversionContext = {
	marks: PmMark[];
	inMathMode: boolean;
	inlineBuffer: PmNode[];
};

export type ConversionOptions = {
	preserveComments?: boolean;
	/** unknown macro/env handling: 'raw_latex' block (default), 'inline' text, or 'ignore'. */
	unknownHandling?: 'raw_latex' | 'inline' | 'ignore';
	/** the verbatim-preserved preamble. The parser only gets the body, so this is scanned for
	 *  \newcommand signatures; otherwise preamble-defined commands' args detach and lose braces. */
	preamble?: string;
	/** the arguments the document's loaded files give; absent: texpile/ctan-base's */
	table?: PackageTable;
	/** progress ping for the loading UI; fired at the few boundaries we can actually observe
	 *  (the unified-latex parse itself is one opaque sync call). */
	onPhase?: (phase: 'building') => void;
};

/**
 * Realise mark descriptors into a proper prosemirror mark SET via Mark.addToSet, not a raw
 * .map() array: nested same-mark sources (\emph{\textit{...}} both map to em) would produce
 * [em, em], an invalid mark collection doc.check() rejects.
 */
export function realMarks(marks?: PmMark[] | null): readonly PMMarkT[] {
	if (!marks || marks.length === 0) return PMMarkT.none;
	let set: readonly PMMarkT[] = PMMarkT.none;
	for (const m of marks) set = schema.marks[m.type].create(m.attrs ?? null).addToSet(set);
	return set;
}

/** Build a real text node, or null for the empty string (PM forbids empty text). `spans` say which bytes it came from */
export function textNode(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PMNodeT | null {
	return text.length > 0 ? noteSpans(schema.text(text, realMarks(marks)), spans) : null;
}

/** Like `textNode`, but returns a (possibly empty) array for handlers that return PmNode[]. */
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
	// joined here rather than by ProseMirror, which would make new text nodes and lose where they came from
	const kids = collapseTextNodes((content ?? []).filter((c): c is PMNodeT => c != null));
	const nodeType = schema.nodes[type];
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

/** Convert a unified-latex node back to a LaTeX string (for raw_latex / inline_latex passthrough). */
export function nodeToLatexString(node: Node): string {
	try {
		return printRaw(node);
	} catch {
		return '';
	}
}

export function createDefaultContext(): ConversionContext {
	return { marks: [], inMathMode: false, inlineBuffer: [] };
}

/** Merge adjacent same-mark text nodes into single runs (and drop empty text, which PM forbids). */
export function collapseTextNodes(nodes: PmNode[]): PmNode[] {
	if (nodes.length === 0) return nodes;

	const result: PmNode[] = [];
	let buf = '';
	let bufMarks: readonly PMMarkT[] = PMMarkT.none;
	let parts: { len: number; spans: LeafSpan[] | undefined }[] = [];
	function flush() {
		if (buf.length > 0) result.push(noteSpans(schema.text(buf, bufMarks), concatSpans(parts)));
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
