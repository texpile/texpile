// the file's pictures as its Lezer tree reads them
import type { SyntaxNode } from '@lezer/common';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

// circuitikz's environment is a tikzpicture with circuit settings
const PICTURES = new Set(['tikzpicture', 'circuitikz', 'tikzcd', 'forest']);

/** `closed`: its own \end closes it */
export type PictureSpan = { from: number; to: number; name: string; closed: boolean };

function spanOf(text: string, env: SyntaxNode): PictureSpan {
	return { from: env.from, to: env.to, name: environmentName(text, env.firstChild!), closed: env.lastChild?.name === 'EndEnv' };
}

export function isPicture(span: PictureSpan | null): span is PictureSpan {
	return !!span && span.closed && PICTURES.has(span.name);
}

/** the environment whose \begin is at `at`, a picture or not */
export function environmentAt(text: string, at: number): PictureSpan | null {
	for (let n: SyntaxNode | null = latexTreeOf(text).resolveInner(at, 1); n && n.from === at; n = n.parent)
		if (n.name === 'Environment' && n.firstChild) return spanOf(text, n);
	return null;
}

/** the pictures of the file, in order; one inside another is part of it */
export function picturesIn(text: string): PictureSpan[] {
	const found: PictureSpan[] = [];
	latexTreeOf(text).iterate({
		enter: (n) => {
			if (n.name !== 'Environment' || !n.node.firstChild) return;
			const span = spanOf(text, n.node);
			if (!isPicture(span)) return;
			found.push(span);
			return false;
		}
	});
	return found;
}
