// low-level ProseMirror builders + shared types for the LaTeX to editor converter.
import type { Node } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { Node as PMNodeT, Mark as PMMarkT } from 'prosemirror-model';
import { schema } from '$lib/schema/schema';

export type PMNode = PMNodeT;

/** A lightweight descriptor of a mark to apply; realised into a Mark at text-build time. */
export interface PMMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface ConversionContext {
	marks: PMMark[];
	inMathMode: boolean;
	inlineBuffer: PMNode[];
}

export interface ConversionOptions {
	preserveComments?: boolean;
	/** unknown macro/env handling: 'raw_latex' block (default), 'inline' text, or 'ignore'. */
	unknownHandling?: 'raw_latex' | 'inline' | 'ignore';
	/** the verbatim-preserved preamble. The parser only gets the body, so this is scanned for
	 *  \newcommand signatures; otherwise preamble-defined commands' args detach and lose braces. */
	preamble?: string;
	/** progress ping for the loading UI; fired at the few boundaries we can actually observe
	 *  (the unified-latex parse itself is one opaque sync call). */
	onPhase?: (phase: 'building') => void;
}

/**
 * Realise mark descriptors into a proper prosemirror mark SET via Mark.addToSet, not a raw
 * .map() array: nested same-mark sources (\emph{\textit{...}} both map to em) would produce
 * [em, em], an invalid mark collection doc.check() rejects.
 */
export function realMarks(marks?: PMMark[] | null): readonly PMMarkT[] {
	if (!marks || marks.length === 0) return PMMarkT.none;
	let set: readonly PMMarkT[] = PMMarkT.none;
	for (const m of marks) set = schema.marks[m.type].create(m.attrs ?? null).addToSet(set);
	return set;
}

/** Build a real text node, or null for the empty string (PM forbids empty text). */
export function txt(text: string, marks?: PMMark[] | null): PMNodeT | null {
	return text.length > 0 ? schema.text(text, realMarks(marks)) : null;
}

/** Like `txt`, but returns a (possibly empty) array for handlers that return PMNode[]. */
export function txtNodes(text: string, marks?: PMMark[] | null): PMNodeT[] {
	const t = txt(text, marks);
	return t ? [t] : [];
}

// createChecked in dev/tests: create validates attrs but NOT content placement, so a misplaced
// block parses and renders fine, then the FIRST structural edit throws and freezes ProseMirror.
// production stays lenient on purpose: a loose node should open degraded, not refuse to load.
const STRICT_NODES = import.meta.env.DEV || import.meta.env.MODE === 'test';

/** Build an element node; null/undefined children dropped. Checked in dev/tests (STRICT_NODES). */
export function el(
	type: string,
	attrs?: Record<string, unknown> | null,
	content?: ReadonlyArray<PMNodeT | null | undefined> | null
): PMNodeT {
	const kids = (content ?? []).filter((c): c is PMNodeT => c != null);
	const nodeType = schema.nodes[type];
	if (STRICT_NODES) {
		try {
			return nodeType.createChecked(attrs ?? null, kids.length > 0 ? kids : undefined);
		} catch (e) {
			const shape = kids.map((k) => k.type.name).join(', ');
			throw new Error(`el('${type}') built invalid content [${shape}]: ${e instanceof Error ? e.message : String(e)}`);
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
export function collapseTextNodes(nodes: PMNode[]): PMNode[] {
	if (nodes.length === 0) return nodes;

	const result: PMNode[] = [];
	let buf = '';
	let bufMarks: readonly PMMarkT[] = PMMarkT.none;
	const flush = () => {
		if (buf.length > 0) result.push(schema.text(buf, bufMarks));
		buf = '';
		bufMarks = PMMarkT.none;
	};

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
		} else {
			flush();
			result.push(node);
		}
	}
	flush();
	return result;
}
