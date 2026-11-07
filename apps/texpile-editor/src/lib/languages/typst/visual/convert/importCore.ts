// the walk and the builders, handed to a plugin's import with the source it reads
import type { SyntaxNode } from '@lezer/common';
import type { TypstImport, TypstImportCore } from '../core/plugin/typstDocumentPlugin';
import { buildNode, collapseTextNodes, textNode, textNodes } from './builders';
import { chip, convertInline, inlineElementNodes, rawBlock, stringContent, withMarks } from './inlineConvert';
import { convertMarkup, ensureBlocks, notedBlocks, withGap } from './converter';
import { codeBodyNode } from './calls/codeBody';
import { contentBody } from './envConvert';
import { calleeName } from './reading/callLevel';

const core: TypstImportCore = {
	node: (type, attrs, content) => buildNode(type, attrs, content),
	text: (text, marks, spans) => textNode(text, marks, spans),
	texts: (text, marks, spans) => textNodes(text, marks, spans),
	collapse: (nodes) => collapseTextNodes(nodes),
	withMarks: (node, marks) => withMarks(node, marks),
	inline: (nodes, src, marks) => convertInline(nodes, src, marks),
	markup: (kids, src) => convertMarkup(kids, src),
	noted: (segs) => notedBlocks(segs),
	ensureBlocks: (blocks) => ensureBlocks(blocks),
	withGap: (node, gap) => withGap(node, gap),
	chip: (text, marks, from) => chip(text, marks, from),
	raw: (text, from) => rawBlock(text, from),
	string: (str, src) => stringContent(str, src),
	element: (hash, call, src, marks) => inlineElementNodes(hash, call, src, marks),
	codeBody: (arg, src) => codeBodyNode(arg, src),
	contentBody: (body, src) => contentBody(body, src)
};

let last: TypstImport | null = null;

export function importOf(src: string): TypstImport {
	if (last?.src !== src) last = { src, core };
	return last;
}

export function callName(call: SyntaxNode, src: string): string | null {
	return call.name === 'FuncCall' ? calleeName(call.firstChild, src) : null;
}
