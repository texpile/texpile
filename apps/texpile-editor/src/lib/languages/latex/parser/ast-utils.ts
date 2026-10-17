export { visit, CONTINUE, SKIP, EXIT } from '@unified-latex/unified-latex-util-visit';
export { match } from '@unified-latex/unified-latex-util-match';

import type { Node, Macro, Environment, Argument } from '@unified-latex/unified-latex-types';
import { visit } from '@unified-latex/unified-latex-util-visit';
import { match } from '@unified-latex/unified-latex-util-match';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';

type AstNode = Node | Argument;
// exactly the union visit() accepts: its array member is Node[], never Argument[], so don't
// widen this past what visit() supports.
type AstTree = Node | Argument | Node[];

/** heuristics.ts stamps `_raw` (a verbatim source capture) out-of-band; when set, the node
 *  serializes via this literal text instead of its structural content/args. */
export type RawStamped<T> = T & { _raw?: string };

export function findAll(ast: AstTree, predicate: (node: AstNode) => boolean): AstNode[] {
	const results: AstNode[] = [];
	visit(ast, (node) => {
		if (predicate(node)) {
			results.push(node);
		}
	});
	return results;
}

export function findMacros(ast: AstTree, macroName: string): Macro[] {
	return findAll(ast, (n) => match.macro(n, macroName)) as Macro[];
}

export function findEnvironments(ast: AstTree, envName: string): Environment[] {
	return findAll(ast, (n) => match.environment(n, envName)) as Environment[];
}

export function getTextContent(node: AstNode | AstNode[]): string {
	if (Array.isArray(node)) {
		return node.map(getTextContent).join('');
	}

	switch (node.type) {
		case 'string':
			return node.content;
		case 'whitespace':
			return ' ';
		case 'parbreak':
			return '\n\n';
		case 'root':
		case 'group':
		case 'inlinemath':
		case 'displaymath':
			return node.content?.map(getTextContent).join('') ?? '';
		case 'environment':
		case 'mathenv':
			return node.content?.map(getTextContent).join('') ?? '';
		case 'macro':
			// keep the WHOLE call: recursing into args would collapse \refsec{modeling} to bare
			// "modeling", turning a working cross-reference into plain text. call sites only ever
			// expect a bare identifier/URL/color name here.
			return printRaw(node);
		case 'argument':
			return node.content?.map(getTextContent).join('') ?? '';
		default:
			return '';
	}
}

/** first mandatory {...} arg with content, skipping star and optional [] args. */
export function getMacroFirstArg(macro: Macro): Node[] {
	if (!macro.args || macro.args.length === 0) {
		return [];
	}
	for (const arg of macro.args) {
		if (arg.openMark === '{' && arg.content && arg.content.length > 0) {
			return arg.content;
		}
	}
	return [];
}

export function getMacroArg(macro: Macro, index: number): Node[] {
	if (!macro.args || index >= macro.args.length) {
		return [];
	}
	return macro.args[index].content ?? [];
}
