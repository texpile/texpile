// a Typst definition read as a row of what is defined and what it stands for
import type { SyntaxNode } from '@lezer/common';
import { letParts } from '../../../knowledge/scan/readEntry';
import { partsOf, textOf } from '../../../knowledge/scan/syntax';
import { importOf } from '../../../knowledge/scan/moduleScope';

export type DefinitionRow = {
	/** what is defined: a name, a destructuring pattern, or the module a file imports */
	name: string;
	/** a function's parameters as written, `(title)` */
	params: string;
	/** what it stands for */
	body: SyntaxNode | null;
	/** the text the body is read from */
	source: string;
	/** an import's names */
	imported?: string;
};

export function oneLine(text: string): string {
	return text
		.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function letRow(node: SyntaxNode, source: string): DefinitionRow | null {
	const head = partsOf(node).find((p) => p.name !== 'Let');
	if (!head) return null;
	const { params, body } = letParts(node, source);
	if (head.name === 'Closure' && head.firstChild?.name === 'Ident') {
		return { name: textOf(head.firstChild, source), params: params ? oneLine(textOf(params, source)) : '', body, source };
	}
	if (head.name !== 'Ident' && head.name !== 'Destructuring') return null;
	const lambda = body?.name === 'Closure' ? body : null;
	return {
		name: oneLine(textOf(head, source)),
		params: lambda?.getChild('Params') ? oneLine(textOf(lambda.getChild('Params')!, source)) : '',
		body: lambda ? (partsOf(lambda).pop() ?? null) : body,
		source
	};
}

function importRow(node: SyntaxNode, source: string): DefinitionRow | null {
	// a path held in a let shows as that let's name
	const imp = importOf(node, source, (name) => name);
	if (!imp || imp.spec.startsWith('@')) return null;
	const items = node.getChild('ImportItems');
	const imported = imp.items === '*' ? '*' : items ? oneLine(textOf(items, source)) : imp.as ? `as ${imp.as}` : '';
	return { name: imp.spec, params: '', body: null, source, imported };
}

/** a let, a destructuring or an import of a local module read as a row; null for any other statement */
export function definitionRow(node: SyntaxNode, source: string): DefinitionRow | null {
	if (node.name === 'LetBinding') return letRow(node, source);
	return node.name === 'ModuleImport' ? importRow(node, source) : null;
}
