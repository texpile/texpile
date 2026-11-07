// inline Markdown off the tree: the content of a paragraph, a heading or a table cell. Each node is read by the plugin
// that lists its name; what no plugin draws (escapes, entities, raw HTML) is read here
import type { SyntaxNode } from '@lezer/common';
import { decodeHTMLStrict } from 'entities/decode';
import { collapseTextNodes, textNodes, type PmMark, type PmNode } from '../builders';
import { bytesSpan, standsFor } from '$lib/editor/visual/sourceSpans';
import { inlineImports } from '../core/plugin/pluginMap';
import { bytes, stands } from './blockSpans';
import { chip } from './inlineParts';
import { sliceOf, type LineState, type Reader } from './reader';

/** syntax around inline content that stands for nothing in it */
const SYNTAX_MARKS = new Set(['QuoteMark', 'HeaderMark', 'TaskMarker']);

/** source text between nodes: line breaks become soft breaks and the spaces around them go */
export function gapText(r: Reader, from: number, to: number, marks: PmMark[], st: LineState): PmNode[] {
	const out: PmNode[] = [];
	const slice = r.src.text.slice(from, to);
	let i = 0;
	while (i < slice.length) {
		const nl = slice.indexOf('\n', i);
		let line = nl < 0 ? slice.slice(i) : slice.slice(i, nl);
		let start = from + i;
		if (st.atStart) {
			const lead = /^[ \t]*/.exec(line)![0].length;
			start += lead;
			line = line.slice(lead);
		}
		if (nl >= 0) line = line.replace(/[ \t]+$/, '');
		if (line) {
			out.push(...textNodes(line, marks, bytes(r, start, line)));
			st.inContent();
		}
		if (nl < 0) break;
		out.push(...textNodes(' ', marks, standsFor(1, r.src.at(start + line.length), r.src.at(from + nl + 1))));
		st.startLine();
		i = nl + 1;
	}
	return out;
}

type CoreInline = (r: Reader, node: SyntaxNode, marks: PmMark[]) => PmNode[];

function readEscape(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	return textNodes(r.src.text[node.from + 1], marks, bytesSpan(1, r.src.at(node.from + 1)));
}

function readEntity(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const raw = sliceOf(r, node);
	const decoded = decodeHTMLStrict(raw);
	return textNodes(decoded, marks, decoded === raw ? bytesSpan(raw.length, r.src.at(node.from)) : stands(r, node, decoded.length));
}

// a chip per tag: the prose between <span> and </span> stays editable text
function readHtml(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const raw = sliceOf(r, node);
	return chip('html', raw, bytes(r, node.from, raw), marks);
}

const CORE_INLINE: Record<string, CoreInline> = {
	Escape: readEscape,
	Entity: readEntity,
	HTMLTag: readHtml,
	Comment: readHtml,
	ProcessingInstruction: readHtml
};

/** a node read by the first plugin that takes it, else by the core; null for one nothing draws */
function readNode(
	r: Reader,
	node: SyntaxNode,
	marks: PmMark[],
	st: LineState,
	to: number
): PmNode[] | { nodes: PmNode[]; next: number } | null {
	for (const read of inlineImports.get(node.name) ?? []) {
		const got = read(r, node, marks, st, to);
		if (got) return got;
	}
	return CORE_INLINE[node.name]?.(r, node, marks) ?? null;
}

/** the content between `from` and `to`, its inline nodes `kids`, as ProseMirror inline nodes wearing `marks` */
export function readInline(r: Reader, kids: SyntaxNode[], from: number, to: number, marks: PmMark[], st: LineState): PmNode[] {
	const out: PmNode[] = [];
	let at = from;
	for (const k of kids) {
		if (k.from < at || k.to > to) continue;
		if (k.from > at) out.push(...gapText(r, at, k.from, marks, st));
		at = k.to;
		if (SYNTAX_MARKS.has(k.name)) {
			// a quote's marker at the start of a continuation line is no content, and nor is the space after it
			st.startLine();
			continue;
		}
		if (!inlineImports.has(k.name) && !(k.name in CORE_INLINE)) {
			out.push(...gapText(r, k.from, k.to, marks, st));
			continue;
		}
		st.inContent();
		const read = readNode(r, k, marks, st, to);
		if (!read) out.push(...gapText(r, k.from, k.to, marks, st));
		else if (Array.isArray(read)) out.push(...read);
		else {
			out.push(...read.nodes);
			at = read.next;
		}
	}
	if (at < to) out.push(...gapText(r, at, to, marks, st));
	return collapseTextNodes(out);
}
