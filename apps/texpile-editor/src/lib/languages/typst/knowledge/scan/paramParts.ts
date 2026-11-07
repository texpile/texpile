// the title block parts a template's parameters set, read from what its body hands to std `document`
import type { SyntaxNode } from '@lezer/common';
import type { TypstParam, TypstTitlePart } from '../types';
import { letParts, paramsOf } from './readEntry';
import { partsOf, textOf } from './syntax';

// std `document`'s fields: kernel names, because the std data gives them no part
const DOCUMENT_PARTS: Readonly<Record<string, TypstTitlePart>> = {
	title: 'title',
	author: 'author',
	date: 'date',
	keywords: 'keywords',
	description: 'abstract'
};

function findMentionedParams(value: SyntaxNode, source: string, names: Set<string>): Set<string> {
	const out = new Set<string>();
	value.cursor().iterate((n) => {
		if (n.name !== 'Ident') return;
		const parent = n.node.parent;
		if (parent?.name === 'FieldAccess' && parent.firstChild?.from !== n.from) return;
		if (parent?.name === 'Named' && parent.firstChild?.from === n.from) return;
		if (parent?.name === 'Params') return;
		const name = textOf(n.node, source);
		if (names.has(name)) out.add(name);
	});
	return out;
}

function readDocumentParts(
	body: SyntaxNode,
	source: string,
	params: TypstParam[],
	isDocument: (name: string) => boolean
): Array<[string, TypstTitlePart]> {
	const names = new Set(params.map((p) => p.name));
	const out: Array<[string, TypstTitlePart]> = [];
	body.cursor().iterate((n) => {
		if (n.name !== 'SetRule' && n.name !== 'FuncCall') return;
		const callee = n.name === 'SetRule' ? n.node.getChild('Ident') : n.node.firstChild;
		const args = n.node.getChild('Args');
		if (callee?.name !== 'Ident' || !args || !isDocument(textOf(callee, source))) return;
		for (const named of args.getChildren('Named')) {
			const [key, value] = partsOf(named).filter((c) => c.name !== 'Colon');
			const field = key && value ? textOf(key, source) : '';
			const part = Object.hasOwn(DOCUMENT_PARTS, field) ? DOCUMENT_PARTS[field] : undefined;
			const found = part ? findMentionedParams(value, source, names) : null;
			// a field made of several parameters (`draft + title-en`) is none of them alone
			if (part && found?.size === 1) out.push([[...found][0], part]);
		}
	});
	return out;
}

export function setDocumentParts(params: TypstParam[], body: SyntaxNode, source: string, isDocument: (name: string) => boolean): void {
	for (const [name, part] of readDocumentParts(body, source, params, isDocument)) {
		const param = params.find((p) => p.name === name);
		if (param) param.part ??= part;
	}
}

export function readOwnFunctionParams(node: SyntaxNode, source: string): TypstParam[] | null {
	const parts = letParts(node, source);
	if (!parts.params) return null;
	const params = paramsOf(parts.params, source);
	if (parts.body) setDocumentParts(params, parts.body, source, (name) => name === 'document');
	return params;
}
