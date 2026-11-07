// Deterministic ProseMirror -> Markdown serializer: the latexSerializer's sibling dialect.
// String-returning handlers per node type over the shared Ctx contract, the plugins' for their elements; doc assembly
// (verbatim substitution + per-block memo) delegated to blockAssembly. prosemirror-markdown's
// serializer can't drive prosemirror-flat-list (it walks nested list NODES; flat-list is one
// node per item), so list/emphasis logic lives here; escaping follows prosemirror-markdown's
// rules. Convention: every block handler ends with its own separation ('\n\n', lists '\n'
// mid-run), so plain concatenation of parts is a valid document.
import type { Node } from 'prosemirror-model';
import { createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { Ctx } from '$lib/serializer/types';
import type { MarkdownSaveCore } from '../core';
import { interrupts, nodeSaves, spliceChild } from '../core/plugin/pluginMap';
import { escMd } from './inlineSyntax';
import { renderInline, mdShadow, isMdHandlerLeaf } from './markdownInline';

/** children serialized and concatenated (handlers carry their own separators), tail trimmed. */
function renderBlocks(parent: Node, inTableCell = false): string {
	let out = '';
	parent.forEach((child, _offset, i) => {
		out += serializeMdNode(child, { parent, index: i, isLastChild: i === parent.childCount - 1, inTableCell });
	});
	return out.replace(/\n+$/, '');
}

function isEmptyParagraph(node: Node): boolean {
	if (node.type.name !== 'paragraph') return false;
	let empty = true;
	node.forEach((c) => {
		if (c.isText) {
			if (c.marks.some((m) => m.type.name === 'code') ? c.text : c.text?.trim()) empty = false;
		} else if (c.type.name !== 'hard_break') empty = false;
	});
	return empty;
}

const core: MarkdownSaveCore = { blocks: renderBlocks, inline: renderInline, node: serializeMdNode, interrupts };

/** Serialize one node to Markdown. Unknown types preserve their content rather than dropping it. */
export function serializeMdNode(node: Node, ctx: Ctx): string {
	const name = node.type.name;
	// blank lines are semantic no-ops, as on the LaTeX side
	const out = nodeSaves.get(name)?.(node, ctx, core) ?? coreSave(node, ctx);
	if (out === undefined) {
		if (node.isText) return escMd(node.text ?? '');
		if (node.isInline) {
			// inline strays (should have come through renderInline) degrade to leafText/plain text
			const leafText = node.type.spec.leafText;
			return leafText ? leafText(node) : node.textContent;
		}
		const inner = renderBlocks(node, ctx.inTableCell);
		return inner ? inner + '\n\n' : '';
	}
	return isMdHandlerLeaf(node) ? mdShadow.shadowed(node, out) : out;
}

/** the nodes the core writes: paragraphs, and raw source (html in a markdown doc, latex via cross-dialect paste) as it is */
function coreSave(node: Node, ctx: Ctx): string | undefined {
	switch (node.type.name) {
		case 'paragraph':
			if (isEmptyParagraph(node)) return '';
			return renderInline(node, { startOfLine: true, inTableCell: ctx.inTableCell }) + '\n\n';
		case 'raw_latex':
			return node.textContent ? node.textContent + '\n\n' : '';
		default:
			return undefined;
	}
}

/** what continues a child's lines inside its container: the prefix the file gave its second line,
 *  else the width of what stood before its first (a marker becomes spaces, a quote's `>` stays) */
function continuation(_parent: Node, text: string, head: string, child: Node): string {
	const nl = text.indexOf('\n');
	// the lines after indented code's first carry the code's own four columns, which its fence leaves out
	if (child.type.name === 'code_block' && child.attrs.env === 'indented') return head.replace(/[^>]/g, ' ');
	if (nl < 0) return head.replace(/[^>]/g, ' ');
	const prefix = /^[ \t]*(?:>[ \t]*)*/.exec(text.slice(nl + 1))![0];
	// a quote's second line carries the quote's own marker after its container's: the container's
	// part is what continues the quote's lines, the quote writes its own
	return text.startsWith('>') ? prefix.replace(/>[ \t]*$/, '') : prefix;
}

// a character markdown cannot read as part of anything beside it
const PLAIN_SEAM = /^[\p{L}\p{N} .,;?'"]$/u;

// Markdown is kept at block granularity: an untouched block, at the top level or inside a list
// item or a quote, is the file's bytes; a block that changed in anything but plain text is written
// whole. A paragraph written whole respells what the file wrote its own way (a reference link, an
// entity, _emphasis_), so plain text retyped is patched in place, but only between plain
// characters: a seam beside a delimiter, an escape or a line start is where Markdown's loose
// grammar reads two things as one
const assembly = createBlockAssembly((node, ctx) => serializeMdNode(node, ctx), {
	mapLeaves: (node, ctx, text) => mdShadow.mapBlockLeaves(serializeMdNode, node, ctx, text),
	leafBytes: (leaf, parent, atStart, block, ctx) =>
		leaf.marks.length || parent !== block || ctx?.inTableCell || parent.type.spec.code ? null : escMd(leaf.text ?? '', atStart),
	keepApart: (bytes, tail, head) => {
		const word = /\S*$/.exec(head)![0] + bytes + /^\S*/.exec(tail)![0];
		// a line start, where digits can still become a list's number
		if (/(^|\n)[ \t>]*\d*$/.test(head) || /[:/@&<]|www\./i.test(word)) return null;
		// an escape, or anything markdown may read as syntax where the fresh bytes end up (a heading's closing #)
		if (/[\\!#$%&()*+\-/:<=>@[\]^_`{|}~]/.test(bytes)) return null;
		const last = (bytes || head).slice(-1);
		const sides = [head.slice(-1), bytes.slice(0, 1), bytes.slice(-1)].filter(Boolean);
		if (!sides.every((c) => PLAIN_SEAM.test(c))) return null;
		// spaces before a line end are a line break
		if (tail.startsWith('\n')) return /\s/.test(last) ? null : bytes;
		return tail === '' || PLAIN_SEAM.test(tail[0]) ? bytes : null;
	},
	spliceChild: (parent, index) => spliceChild(parent, index),
	continuation
});

export function serializeToMarkdown(doc: Node): string {
	return assembly.serializeDocChildrenDetailed(doc).text;
}

export function serializeToMarkdownDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc, parse, afresh);
}
