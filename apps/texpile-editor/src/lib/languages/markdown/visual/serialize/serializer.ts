// prosemirror-markdown's serializer cannot drive prosemirror-flat-list (one node per item), so list and emphasis logic lives here
import type { Node } from 'prosemirror-model';
import { createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { Ctx } from '$lib/serializer/types';
import type { MarkdownSaveCore } from '../core';
import { interrupts, nodeSaves, spliceChild, tightPair } from '../core/plugin/pluginMap';
import { escMd } from './inlineSyntax';
import { renderInline, mdShadow, isMdHandlerLeaf } from './markdownInline';

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

export function serializeMdNode(node: Node, ctx: Ctx): string {
	const name = node.type.name;
	// blank lines are semantic no-ops, as on the LaTeX side
	const out = nodeSaves.get(name)?.(node, ctx, core) ?? coreSave(node, ctx);
	if (out === undefined) {
		if (node.isText) return escMd(node.text ?? '');
		if (node.isInline) {
			const leafText = node.type.spec.leafText;
			return leafText ? leafText(node) : node.textContent;
		}
		const inner = renderBlocks(node, ctx.inTableCell);
		return inner ? inner + '\n\n' : '';
	}
	return isMdHandlerLeaf(node) ? mdShadow.shadowed(node, out) : out;
}

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

function continuation(_parent: Node, text: string, head: string, child: Node): string {
	const nl = text.indexOf('\n');
	if (child.type.name === 'code_block' && child.attrs.env === 'indented') return head.replace(/[^>]/g, ' ');
	if (nl < 0) return head.replace(/[^>]/g, ' ');
	const prefix = /^[ \t]*(?:>[ \t]*)*/.exec(text.slice(nl + 1))![0];
	return text.startsWith('>') ? prefix.replace(/>[ \t]*$/, '') : prefix;
}

const PLAIN_SEAM = /^[\p{L}\p{N} .,;?'"]$/u;

// plain text retyped is patched in place, but only between plain characters: beside a delimiter, an escape or a line start two things read as one
const assembly = createBlockAssembly((node, ctx) => serializeMdNode(node, ctx), {
	mapLeaves: (node, ctx, text) => mdShadow.mapBlockLeaves(serializeMdNode, node, ctx, text),
	leafBytes: (leaf, parent, atStart, block, ctx) =>
		leaf.marks.length || parent !== block || ctx?.inTableCell || parent.type.spec.code ? null : escMd(leaf.text ?? '', atStart),
	keepApart: (bytes, tail, head) => {
		const word = /\S*$/.exec(head)![0] + bytes + /^\S*/.exec(tail)![0];
		if (/(^|\n)[ \t>]*\d*$/.test(head) || /[:/@&<]|www\./i.test(word)) return null;
		if (/[\\!#$%&()*+\-/:<=>@[\]^_`{|}~]/.test(bytes)) return null;
		const last = (bytes || head).slice(-1);
		const sides = [head.slice(-1), bytes.slice(0, 1), bytes.slice(-1)].filter(Boolean);
		if (!sides.every((c) => PLAIN_SEAM.test(c))) return null;
		if (tail.startsWith('\n')) return /\s/.test(last) ? null : bytes;
		return tail === '' || PLAIN_SEAM.test(tail[0]) ? bytes : null;
	},
	spliceChild: (parent, index) => spliceChild(parent, index),
	boundary: (prev, next) => (tightPair(prev.node, next.node) ? '\n' : null),
	continuation
});

export function serializeToMarkdown(doc: Node): string {
	return assembly.serializeDocChildrenDetailed(doc).text;
}

export function serializeToMarkdownDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc, parse, afresh);
}
