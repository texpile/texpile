import type { SyntaxNode } from '@lezer/common';
import { buildNode, type PmNode } from '../builders';
import { noteBlockSpan } from '$lib/editor/visual/sourceSpans';
import { blockImports, paragraphImports } from '../core/plugin/pluginMap';
import { nestedSpan, topLevelSpan } from './blockSpans';
import { rawBlock } from './rawBlocks';
import { readContent, type Reader } from './reader';

type BlockReader = (r: Reader, node: SyntaxNode) => PmNode[];

export function ensureBlocks(blocks: PmNode[]): PmNode[] {
	return blocks.length > 0 ? blocks : [buildNode('paragraph')];
}

const CONTAINER_MARKS = new Set(['QuoteMark', 'ListMark']);

const readHtml = rawBlock('html');
const readRaw = rawBlock('markdown');

function readParagraph(r: Reader, node: SyntaxNode): PmNode[] {
	for (const read of paragraphImports) {
		const block = read(r, node);
		if (block) return block;
	}
	return [buildNode('paragraph', { indent: 'auto' }, readContent(r, node))];
}

const CORE_BLOCKS: Record<string, BlockReader> = {
	Paragraph: readParagraph,
	HTMLBlock: readHtml,
	CommentBlock: readHtml,
	ProcessingInstructionBlock: readHtml
};

export function readBlock(r: Reader, node: SyntaxNode): PmNode[] {
	return (blockImports.get(node.name) ?? CORE_BLOCKS[node.name] ?? readRaw)(r, node);
}

export function readNested(r: Reader, kids: SyntaxNode[]): PmNode[] {
	const out: PmNode[] = [];
	let prevEnd = 0;
	for (const kid of kids) {
		if (CONTAINER_MARKS.has(kid.name)) continue;
		const blocks = readBlock(r, kid);
		const span = nestedSpan(r, kid);
		if (span && blocks.length > 0 && span.srcFrom >= prevEnd && (span.srcTo > span.srcFrom || blocks.length === 1)) {
			out.push(noteBlockSpan(blocks[0], { ...span, size: blocks.length }), ...blocks.slice(1));
			prevEnd = span.srcTo;
		} else out.push(...blocks);
	}
	return out;
}

export function readTopLevel(r: Reader, kids: SyntaxNode[]): PmNode[] {
	const out: PmNode[] = [];
	let prevEnd = 0;
	for (const kid of kids) {
		const blocks = readBlock(r, kid);
		const span = topLevelSpan(r, kid);
		if (span && span.srcFrom >= prevEnd && blocks.length > 0) {
			out.push(noteBlockSpan(blocks[0], { ...span, size: blocks.length }), ...blocks.slice(1));
			prevEnd = Math.max(prevEnd, span.srcTo);
		} else out.push(...blocks);
	}
	return out;
}
