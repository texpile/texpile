// a call standing as a block: alone in its paragraph, or block-level among prose, where Typst ends the paragraph
import type { SyntaxNode } from '@lezer/common';
import { convertInline, rawBlock } from '../inlineConvert';
import type { Seg } from '../converter';
import { blockCalls, blockRoles } from '../../core/plugin/documentMap';
import { callName, importOf } from '../importCore';
import { aloneWithLabel } from '../reading/blockEnds';
import { envSeg } from '../envConvert';

type BlockCallSeg = { seg: Seg; next: number };

function namedBlock(kids: SyntaxNode[], i: number, src: string): BlockCallSeg | null {
	const name = callName(kids[i + 1], src);
	for (const read of (name && blockCalls.get(name)) || []) {
		const block = read(importOf(src), kids, i);
		if (block) return block;
	}
	return null;
}

function roleBlock(kids: SyntaxNode[], i: number, src: string): BlockCallSeg | null {
	for (const read of blockRoles) {
		const block = read(importOf(src), kids, i);
		if (block) return block;
	}
	return null;
}

function inlineContent(hash: SyntaxNode, call: SyntaxNode, src: string): boolean {
	const nodes = convertInline([hash, call], src, []);
	return !(nodes.length === 1 && nodes[0].type.name === 'inline_latex');
}

export function blockCallSeg(kids: SyntaxNode[], i: number, src: string, lifted: boolean): BlockCallSeg | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const modeled = namedBlock(kids, i, src) ?? envSeg(kids, i, src) ?? roleBlock(kids, i, src);
	if (modeled) return modeled;
	const alone = aloneWithLabel(kids, i + 2, src);
	if (!alone) return null;
	if (!lifted && inlineContent(hash, call, src)) return null;
	const end = alone.label ?? call;
	return { seg: { blocks: [rawBlock(src.slice(hash.from, end.to), hash.from)], from: hash.from, to: end.to }, next: alone.next };
}
