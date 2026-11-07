import type { SyntaxNode } from '@lezer/common';
import type { Node, NodeSpec } from 'prosemirror-model';
import {
	blockStands,
	childrenOf,
	formatImage,
	LineState,
	noteSpans,
	stands,
	targetOf,
	textOf,
	unresolved,
	updateImageNode,
	type MarkdownPlugin,
	type PmMark,
	type PmNode,
	type Reader,
	type SchemaImageSettings
} from '$lib/languages/markdown/visual/core';

// built by hand because the image settings creators pull in the DOM, which the parser's worker cannot load
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null }
};

function imageParts(r: Reader, node: SyntaxNode): { alt: string; src: string; title: string } | null {
	const target = targetOf(r, node);
	if (!target) return null;
	const words = r.inline(r, textOf(node), target.from, target.to, [], new LineState());
	let alt = '';
	for (const n of words) {
		if (n.isText) alt += n.text;
		else if (n.type.name === 'inline_math') alt += `$${n.textContent}$`;
		else if (n.type.name === 'hard_break') alt += ' ';
		else alt += n.textContent;
	}
	return { alt, src: target.href, title: target.title ?? '' };
}

function readInlineImage(r: Reader, node: SyntaxNode, marks: PmMark[], st: LineState): PmNode[] {
	const parts = imageParts(r, node);
	if (!parts) return unresolved(r, node, marks, st);
	const literal = formatImage(parts.alt, parts.src, parts.title);
	return r.chip('markdown', literal, stands(r, node, literal.length), marks);
}

function readParagraphImage(r: Reader, node: SyntaxNode): PmNode[] | null {
	const kids = childrenOf(node).filter((k) => k.name !== 'QuoteMark');
	if (kids.length !== 1 || kids[0].name !== 'Image') return null;
	if (r.src.text.slice(node.from, kids[0].from).trim() || r.src.text.slice(kids[0].to, node.to).trim()) return null;
	const parts = imageParts(r, kids[0]);
	if (!parts) return null;
	const block = r.node(
		'image',
		{ src: parts.src, alt: parts.alt || null, numbered: false, showCaption: !!parts.title },
		parts.title ? r.texts(parts.title) : null
	);
	return [noteSpans(block, blockStands(r, node))];
}

function imageMarkdown(node: Node): string {
	let caption = '';
	node.forEach((c) => (caption += c.type.name === 'hard_break' ? ' ' : c.isText ? (c.text ?? '') : c.textContent));
	return formatImage(String(node.attrs.alt ?? ''), String(node.attrs.src ?? ''), caption.replace(/\s+/g, ' ').trim());
}

export const image: MarkdownPlugin = {
	import: { inline: { Image: readInlineImage }, paragraph: readParagraphImage },
	// the shared image spec defaults numbered to true, which would show a Figure N caption; patched after updateImageNode, not extraAttributes
	schema({ nodes, marks }) {
		const updated = updateImageNode(nodes, schemaImageSettings);
		const spec = updated.get('image') as NodeSpec;
		return { nodes: updated.update('image', { ...spec, attrs: { ...spec.attrs, numbered: { default: false } } }), marks };
	},
	save: {
		nodes: { image: (node) => imageMarkdown(node) + '\n\n' },
		wholeRun: (node) => node.type.name === 'image' && node.childCount === 0
	}
};
