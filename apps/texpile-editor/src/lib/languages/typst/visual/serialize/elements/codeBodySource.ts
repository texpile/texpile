// a body the file wrote as code (an environment's last argument, a figure's body, a grid's cell)
import type { Node } from 'prosemirror-model';
import { TypstParser } from 'texpile-typst-syntax-wasm';
import { children } from '../../convert/reading/syntaxUtils';
import { bracketBody, dedentAfterFirstLine, type EnvBodyRender } from '../envSerializer';
import { typStr } from '../typstEscapes';
import { blockOriginOf } from '$lib/editor/visual/parseOrigins';

let parser: TypstParser | null = null;

/** `#name(..)` or `$..$`, and nothing after it: the expression without its `#`, else null */
function oneExpression(text: string): string | null {
	parser ??= new TypstParser();
	const kids = children(parser.parse(text).topNode);
	if (kids.length === 2 && kids[0].name === 'Hash' && kids[1].to === text.length) return text.slice(1);
	return kids.length === 1 && kids[0].name === 'Equation' && kids[0].from === 0 && kids[0].to === text.length ? text : null;
}

function plainText(node: Node): boolean {
	let plain = node.type.name === 'paragraph';
	node.forEach((child) => {
		if (!child.isText || child.marks.length > 0) plain = false;
	});
	return plain;
}

/** the holder's one block as code while it still writes as one expression, else null */
export function codeBodySource(holder: Node, render: EnvBodyRender, fileIndent: string): string | null {
	const only = holder.attrs.code && holder.childCount === 1 ? holder.child(0) : null;
	if (!only) return null;
	const kept = blockOriginOf(only);
	if (kept?.parse.verbatim && kept.text !== undefined) return dedentAfterFirstLine(kept.text, fileIndent);
	if (only.type.name === 'raw_latex') return dedentAfterFirstLine(only.textContent, fileIndent);
	if (plainText(only)) return typStr(only.textContent);
	const text = render.child(only, holder, 0);
	return only.type.name === 'code_block' ? text : oneExpression(text);
}

/** code a code body's block holds, written in a content block */
function markupOf(code: string): string {
	return /^[\p{L}_([{]/u.test(code) ? `#${code}` : `#(${code})`;
}

/** the holder's body: its code, else a content block, the code it held marked as code there */
export function codeHolderBody(holder: Node, render: EnvBodyRender, fileIndent: string, compact = false): string {
	const code = codeBodySource(holder, render, fileIndent);
	if (code !== null) return code;
	const inBrackets: EnvBodyRender = holder.attrs.code
		? {
				...render,
				child: (node, parent, i) => {
					const text = render.child(node, parent, i);
					return node.type.name === 'raw_latex' ? markupOf(text) : text;
				}
			}
		: render;
	return bracketBody(holder, inBrackets, fileIndent, compact);
}
