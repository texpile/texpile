// a body written as code (`#align(center, table(..))`, a figure's body, a grid's cell)
import type { SyntaxNode } from '@lezer/common';
import { buildNode, type PmNode } from '../builders';
import { convertInline, inlineElementNodes, rawBlock } from '../inlineConvert';
import { stringContent } from '../inlineConvert';
import { codeCalls, markupCode } from '../../core/plugin/documentMap';
import { callName, importOf } from '../importCore';
import { envNode } from '../envConvert';
import { noteBlockSpan } from '$lib/editor/visual/sourceSpans';

function namedCode(call: SyntaxNode, src: string): PmNode | null {
	const name = callName(call, src);
	for (const read of (name && codeCalls.get(name)) || []) {
		const node = read(importOf(src), call);
		if (node) return node;
	}
	return null;
}

function callNode(call: SyntaxNode, src: string): PmNode | null {
	const inline = inlineElementNodes(call, call, src, []);
	return namedCode(call, src) ?? envNode(call, src, call, null) ?? (inline ? expressionParagraph(inline) : null);
}

function expressionParagraph(content: PmNode[]): PmNode {
	return buildNode('paragraph', { indent: 'auto', typExpr: true }, content);
}

function textNode(arg: SyntaxNode, src: string): PmNode | null {
	if (arg.name === 'Str') return expressionParagraph(stringContent(arg, src));
	return arg.name === 'Equation' ? expressionParagraph(convertInline([arg], src, [])) : null;
}

export function codeBodyNode(arg: SyntaxNode, src: string): PmNode {
	const markup = markupCode.get(arg.name);
	const fence = markup ? markup(importOf(src), arg) : null;
	const node =
		fence ?? (arg.name === 'FuncCall' ? callNode(arg, src) : textNode(arg, src)) ?? rawBlock(src.slice(arg.from, arg.to), arg.from);
	return noteBlockSpan(node, { srcFrom: arg.from, srcTo: arg.to, size: 1 });
}
