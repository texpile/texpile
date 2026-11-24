// where a file's \begin{document} and \end{document} are, read off the tree
import type { SyntaxNode, Tree } from '@lezer/common';
import { latexTreeOf } from './latexTrees';
import { environmentName } from './treeMode';

type TokenSpan = { from: number; to: number };

/** `end` null: nothing ends the environment */
export type DocumentWrapper = { begin: TokenSpan; end: TokenSpan | null };

function isDocument(text: string, n: SyntaxNode): boolean {
	return n.name === 'Environment' && !!n.firstChild && environmentName(text, n.firstChild) === 'document';
}

function isClosed(n: SyntaxNode): boolean {
	return n.lastChild?.name === 'EndEnv';
}

function documentNodeOf(text: string, tree: Tree): SyntaxNode | null {
	for (let c = tree.topNode.firstChild; c; c = c.nextSibling) if (isDocument(text, c)) return c;
	const nested: SyntaxNode[] = [];
	tree.iterate({
		enter: (n) => {
			if (isDocument(text, n.node)) nested.push(n.node);
		}
	});
	return nested.find(isClosed) ?? nested[0] ?? null;
}

// an unclosed brace runs its group past \end{document}; a closed group is a macro body, whose \end{document} runs where it is used
function endInRunawayGroup(text: string, tree: Tree, env: SyntaxNode): TokenSpan | null {
	let found: TokenSpan | null = null;
	tree.iterate({
		from: env.from,
		to: env.to,
		enter: (n) => {
			if (found || n.to <= env.from) return false;
			if (n.name === 'Group') return n.node.lastChild?.name !== '}';
			if (n.name === 'StrayEnd' && /^\\end\s*\{\s*document\s*\}$/.test(text.slice(n.from, n.to))) found = { from: n.from, to: n.to };
		}
	});
	return found;
}

/** `tree`: a parse of `text`, an editor's partial one too */
export function documentWrapperIn(text: string, tree: Tree): DocumentWrapper | null {
	const env = documentNodeOf(text, tree);
	if (!env) return null;
	const begin = env.firstChild!;
	const last = env.lastChild!;
	return {
		begin: { from: begin.from, to: begin.to },
		end: isClosed(env) ? { from: last.from, to: last.to } : endInRunawayGroup(text, tree, env)
	};
}

export function documentWrapperOf(text: string): DocumentWrapper | null {
	return documentWrapperIn(text, latexTreeOf(text));
}

const BEGIN_DOCUMENT = /\\begin[ \t]*\{document\}/g;
// a decoy (in a comment, a verbatim environment or after \endinput) costs a longer prefix; past this the whole file is read
const CANDIDATES = 4;

function firstDocumentBegin(text: string, tree: Tree): number | null {
	for (let c = tree.topNode.firstChild; c; c = c.nextSibling) if (isDocument(text, c)) return c.firstChild!.from;
	return null;
}

/** where the \begin{document} the tree reads starts, found in the text up to it alone: the body is never parsed */
export function documentBeginOf(text: string): number | null {
	let tried = 0;
	for (const found of text.matchAll(BEGIN_DOCUMENT)) {
		if (tried++ === CANDIDATES) break;
		const head = text.slice(0, found.index + found[0].length);
		const begin = firstDocumentBegin(head, latexTreeOf(head));
		if (begin !== null) return begin;
	}
	// a begin only inside a group reads as the document too, so the whole tree decides
	return tried ? (documentWrapperOf(text)?.begin.from ?? null) : null;
}

/** where TeX stops reading the file: its \end{document}, a stray one in a fragment too; -1 when it reads to the end */
export function documentEndOf(text: string): number {
	const end = documentWrapperOf(text)?.end;
	if (end) return end.from;
	let at = -1;
	latexTreeOf(text).iterate({
		enter: (n) => {
			// a macro body's \end{document} runs only where the macro is used
			if (at >= 0 || n.name === 'Group') return false;
			if (n.name === 'StrayEnd' && /^\\end\s*\{\s*document\s*\}$/.test(text.slice(n.from, n.to))) at = n.from;
		}
	});
	return at;
}
