// the inline walker: text, spaces, escapes and shorthands, a call or markup read by the plugins, every other construct a chip
import type { SyntaxNode } from '@lezer/common';
import { expressionEnd, SHORTHANDS, unescape, unquote } from './reading/syntaxUtils';
import { buildNode, textNodes, collapseTextNodes, realMarks, type PmNode, type PmMark } from './builders';
import { alignedSpans, bytesSpan, noteSpans, spansOf, standsFor } from '$lib/editor/visual/sourceSpans';
import { elementCalls, elementRoles, inlineCalls, markupInline } from '../core/plugin/documentMap';
import { callName, importOf } from './importCore';

export function withMarks(node: PmNode, marks: PmMark[]): PmNode {
	return marks.length > 0 ? noteSpans(node.mark(realMarks(marks)), spansOf(node)) : node;
}

/** an inline raw-source chip, the escape hatch every unknown inline construct falls into; `from` is where its text starts in the source */
export function chip(text: string, marks: PmMark[], from?: number): PmNode[] {
	const spans = from === undefined ? null : bytesSpan(text.length, from);
	return text ? [withMarks(buildNode('inline_latex', { lang: 'typst' }, textNodes(text, null, spans)), marks)] : [];
}

export function rawBlock(text: string, from?: number): PmNode {
	return buildNode('raw_latex', { lang: 'typst' }, textNodes(text, null, from === undefined ? null : bytesSpan(text.length, from)));
}

/** the inline element a call is, by the plugins that read its name or its data, its marks over it; null for any other call */
export function inlineElementNodes(hash: SyntaxNode, call: SyntaxNode, src: string, marks: PmMark[]): PmNode[] | null {
	const name = callName(call, src);
	const named = name ? elementCalls.get(name)?.(importOf(src), hash, call, marks) : null;
	if (named) return named;
	for (const read of elementRoles) {
		const nodes = read(importOf(src), hash, call, marks);
		if (nodes) return nodes;
	}
	return null;
}

/** inline CST nodes -> inline PM nodes. Pairs each Hash with the expression following it. */
export function convertInline(nodes: SyntaxNode[], src: string, marks: PmMark[]): PmNode[] {
	const out: PmNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const k = nodes[i];
		const slice = src.slice(k.from, k.to);
		const markup = markupInline.get(k.name);
		if (markup) {
			const read = markup(importOf(src), nodes, i, marks);
			if (read) {
				out.push(...read.nodes);
				i = read.next - 1;
			} else out.push(...chip(slice, marks, k.from));
			continue;
		}
		switch (k.name) {
			case 'Text':
				out.push(...textNodes(slice, marks, bytesSpan(slice.length, k.from)));
				break;
			case 'Space':
			case 'Parbreak': // only reachable in odd nests; a wrap is semantically a space
				out.push(...textNodes(' ', marks, standsFor(1, k.from, k.to)));
				break;
			case 'Escape':
				out.push(...textNodes(unescape(slice), marks, alignedSpans(unescape(slice), k.from, slice)));
				break;
			case 'SmartQuote':
				out.push(...textNodes(slice, marks, bytesSpan(slice.length, k.from)));
				break;
			case 'Shorthand':
				out.push(...textNodes(SHORTHANDS[slice] ?? slice, marks, alignedSpans(SHORTHANDS[slice] ?? slice, k.from, slice)));
				break;
			case 'Hash': {
				const next = nodes[i + 1];
				if (!next) {
					out.push(...chip('#', marks, k.from));
					break;
				}
				const name = callName(next, src);
				const named = name ? (inlineCalls.get(name)?.(importOf(src), k, next, marks) ?? null) : null;
				if (named) {
					out.push(...named);
					i++;
					break;
				}
				const element = inlineElementNodes(k, next, src, marks);
				if (element) {
					out.push(...element);
				} else {
					// a terminating semicolon belongs to the expression (`#a; text`)
					const end = expressionEnd(nodes, i + 1, src);
					out.push(...chip(src.slice(k.from, nodes[end].to), marks, k.from));
					i = end - 1;
				}
				i++;
				break;
			}
			// labels, equations, comments and anything unforeseen: verbatim chips
			default:
				out.push(...chip(slice, marks, k.from));
		}
	}
	return collapseTextNodes(out);
}

/** a string argument's text, standing for the bytes between its quotes */
export function stringContent(str: SyntaxNode, src: string): PmNode[] {
	const text = unquote(src.slice(str.from, str.to));
	const inner = src.slice(str.from + 1, str.to - 1);
	return textNodes(text, null, inner === text ? bytesSpan(text.length, str.from + 1) : standsFor(text.length, str.from + 1, str.to - 1));
}
