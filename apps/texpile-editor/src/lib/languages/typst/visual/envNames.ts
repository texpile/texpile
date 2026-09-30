// the names the Environment prompt offers: what the document defines first, then the usual ones
import type { Node as PMNode } from 'prosemirror-model';

// the theorem family most templates define, then builtins that take a body
const COMMON_ENVIRONMENTS = [
	'theorem',
	'lemma',
	'proposition',
	'corollary',
	'definition',
	'example',
	'remark',
	'proof',
	'note',
	'block',
	'align',
	'rect',
	'pad',
	'columns'
];

// `#let name(..) =` defines a function; `#let name = thmbox(..)` or `= f.with(..)` makes one
const DEFINITION = /#let\s+([\p{L}_][\p{L}\p{N}_-]*)\s*(?:\(|=\s*[\p{L}_][\p{L}\p{N}_.-]*\s*\()/gu;

/** the functions a Typst source defines with `#let`, in the order it defines them */
export function definedFunctions(source: string): string[] {
	return [...source.matchAll(DEFINITION)].map((match) => match[1]);
}

/** the names to offer for a new environment: the document's own definitions, the ones it already
 *  uses, then the common ones */
export function environmentSuggestions(source: string, used: string[] = []): string[] {
	return [...new Set([...definedFunctions(source), ...used, ...COMMON_ENVIRONMENTS])];
}

/** the Typst code a visual document holds (its raw islands) and the environments it uses */
export function environmentsInDoc(doc: PMNode): { source: string; used: string[] } {
	const code: string[] = [];
	const used: string[] = [];
	doc.descendants((node) => {
		if (node.type.name === 'raw_latex') code.push(node.textContent);
		if (node.type.name === 'typ_env') used.push(String(node.attrs.name));
		return true;
	});
	return { source: code.join('\n'), used };
}
