import type { SyntaxNode } from '@lezer/common';

/** some of a container's children: the Text at either end may be cut */
export type Stretch = { parent: SyntaxNode; from: number; to: number };

const CLOSERS = new Set([
	'}',
	'GroupEnd',
	'EndEnv',
	'EnvEnd',
	'Dollar',
	'DoubleDollar',
	'CloseDisplay',
	'CloseInline',
	'OwnMathClose',
	'MathEnd'
]);
const OPENERS = new Set(['{', 'BeginEnv', 'VerbatimBegin', 'Dollar', 'DoubleDollar', 'OpenDisplay', 'OpenInline', 'OwnMathOpen']);

/** what a group, an environment, a math span or the document holds between its delimiters */
export function bodyOf(node: SyntaxNode): Stretch {
	const first = node.firstChild;
	const last = node.lastChild;
	const from = first && OPENERS.has(first.name) ? first.to : node.from;
	const to = last && last !== first && CLOSERS.has(last.name) ? last.from : node.to;
	return { parent: node, from, to: Math.max(from, to) };
}

/** the children of `s.parent` that reach into the stretch; a zero-length one (a recovery token) holds nothing */
export function childrenIn(s: Stretch): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = s.parent.firstChild; c && c.from < s.to; c = c.nextSibling) if (c.to > s.from && c.to > c.from) out.push(c);
	return out;
}

/** an environment the source never ends: the tree closes it where its container ends */
export function isUnclosed(node: SyntaxNode): boolean {
	const last = node.lastChild;
	return !!last && last.name === 'EnvEnd' && last.from === last.to;
}

export function environmentName(src: string, token: SyntaxNode): string {
	return /\{\s*([^}]*?)\s*\}/.exec(src.slice(token.from, token.to))?.[1] ?? '';
}

export function isBlankStretch(src: string, s: Stretch): boolean {
	return src.slice(s.from, s.to).trim() === '';
}
