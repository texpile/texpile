// where links and images point, read off their nodes
import type { SyntaxNode } from '@lezer/common';
import type { PmNode, PmMark } from '../builders';
import { readDestination, titleText } from './destinations';
import { childNamed, childrenOf, normalizeLabel, sliceOf, type LineState, type Reader } from './reader';

export type LinkTarget = { href: string; title: string | null; from: number; to: number };

function definitionOf(r: Reader, key: string) {
	return r.definitions.get(normalizeLabel(key)) ?? null;
}

/** what a link or an image points at, and where its text is; null for brackets that point at nothing */
export function targetOf(r: Reader, node: SyntaxNode): LinkTarget | null {
	const kids = childrenOf(node);
	const brackets = kids.filter((k) => k.name === 'LinkMark');
	const open = brackets[0];
	const close = brackets[1];
	if (!open || !close) return null;
	const target = { from: open.to, to: close.from };
	// a URL written in the link's text is no destination
	const url = kids.find((k) => k.name === 'URL' && k.from >= close.to);
	const title = childNamed(node, 'LinkTitle');
	const kind = node.name === 'Image' ? 'src' : 'href';
	if (url) return { ...target, href: readDestination(sliceOf(r, url), kind), title: title ? titleText(sliceOf(r, title)) : null };
	// `[text]()`
	if (brackets.length >= 4) return { ...target, href: '', title: null };
	const label = childNamed(node, 'LinkLabel');
	const written = label ? r.src.text.slice(label.from + 1, label.to - 1) : '';
	const def = definitionOf(r, written.trim() ? written : r.src.text.slice(target.from, target.to));
	if (!def) return null;
	return { ...target, href: readDestination(def.href, kind), title: def.title };
}

/** the nodes of a link or an image that are in its text, not its brackets, label, destination or title */
export function textOf(node: SyntaxNode): SyntaxNode[] {
	const kids = childrenOf(node);
	const close = kids.filter((k) => k.name === 'LinkMark')[1];
	return kids.filter(
		(k) => !['LinkMark', 'LinkLabel', 'LinkTitle'].includes(k.name) && !(k.name === 'URL' && (!close || k.from >= close.to))
	);
}

/** the nodes of a bracketed construct that points at nothing, read as the text it is */
export function unresolved(r: Reader, node: SyntaxNode, marks: PmMark[], st: LineState): PmNode[] {
	return r.inline(r, textOf(node), node.from, node.to, marks, st);
}
