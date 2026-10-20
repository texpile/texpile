// What an agent's rewrite may not do to LaTeX: cite a source the paper does not have, or lose a label
import type { AnchorDialect } from '$lib/comments/anchor';
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';

export type AgentEditProblem = { invented: string[] } | { lost: string[] };

function citedIn(text: string): string[] {
	return keysIn(text, 'citekey', false)
		.filter((k) => !k.wildcard)
		.map((k) => k.key);
}

function definedIn(text: string): string[] {
	return keysIn(text, 'citekey', true).map((k) => k.key);
}

function labelsIn(text: string): string[] {
	return keysIn(text, 'label', true).map((k) => k.key);
}

/** the citation keys a rewrite may use: the .bib's, and any the file already cites or defines */
export function knownCiteKeys(fileText: string, bibKeys: string[]): Set<string> {
	return new Set([...bibKeys, ...citedIn(fileText), ...definedIn(fileText)]);
}

/** what is wrong with `after` replacing `before`, or null when nothing is */
export function agentEditProblem(dialect: AnchorDialect, before: string, after: string, known: Set<string>): AgentEditProblem | null {
	if (dialect !== 'tex') return null;
	const cited = new Set(citedIn(before));
	const invented = [...new Set(citedIn(after))].filter((k) => !cited.has(k) && !known.has(k));
	if (invented.length) return { invented };
	const kept = new Set(labelsIn(after));
	const lost = labelsIn(before).filter((l) => !kept.has(l));
	return lost.length ? { lost } : null;
}
