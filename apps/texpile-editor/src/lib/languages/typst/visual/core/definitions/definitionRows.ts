// a Typst definition read as a row of what is defined and what it stands for
import type { SyntaxNode } from '@lezer/common';
import { letParts } from '../../../knowledge/scan/readEntry';
import { partsOf, textOf } from '../../../knowledge/scan/syntax';
import { importOf } from '../../../knowledge/scan/moduleScope';

export type DefinitionRow = {
	name: string;
	params: string;
	body: SyntaxNode | null;
	source: string;
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
	const imp = importOf(node, source, (name) => name);
	if (!imp || imp.spec.startsWith('@')) return null;
	const items = node.getChild('ImportItems');
	const imported = imp.items === '*' ? '*' : items ? oneLine(textOf(items, source)) : imp.as ? `as ${imp.as}` : '';
	return { name: imp.spec, params: '', body: null, source, imported };
}

export function definitionRow(node: SyntaxNode, source: string): DefinitionRow | null {
	if (node.name === 'LetBinding') return letRow(node, source);
	return node.name === 'ModuleImport' ? importRow(node, source) : null;
}
