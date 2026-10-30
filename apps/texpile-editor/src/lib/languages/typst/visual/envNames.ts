// the names the Environment prompt offers: what the document defines first, then the usual ones
import type { Node as PMNode } from 'prosemirror-model';
import { typstTreeOf } from '../syntax/typstTrees';

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

/** the functions a Typst source defines with `#let`, in the order it defines them */
export async function definedFunctions(source: string): Promise<string[]> {
	const names: string[] = [];
	(await typstTreeOf(source)).iterate({
		enter: (n) => {
			if (n.name !== 'LetBinding' || n.node.prevSibling?.name !== 'Hash') return;
			// `#let name(..) =` defines a function; `#let name = thmbox(..)`, `= f.with(..)` or `= (..) => ..` makes one
			const closure = n.node.getChild('Closure')?.firstChild;
			const defined = closure?.name === 'Ident' && closure.nextSibling?.name === 'Params' ? closure : null;
			const named = n.node.getChild('Ident');
			const made = named && (n.node.getChild('FuncCall') || n.node.getChild('Closure')) ? named : null;
			const name = defined ?? made;
			if (name) names.push(source.slice(name.from, name.to));
		}
	});
	return names;
}

/** the names to offer for a new environment: the document's own definitions, the ones it already
 *  uses, then the common ones */
export async function environmentSuggestions(source: string, used: string[] = []): Promise<string[]> {
	return [...new Set([...(await definedFunctions(source)), ...used, ...COMMON_ENVIRONMENTS])];
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
