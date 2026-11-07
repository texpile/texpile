// a chip that only sets the document up: imports of packages, set rules and show rules
import type { SyntaxNode } from '@lezer/common';
import { unquote } from '../../convert/reading/syntaxUtils';
import { childrenOf, hasSyntaxError, partsOf } from '../../../knowledge/scan/syntax';
import { typstSyntax } from '../reading/typstCall';

export type SetupStatement =
	| { kind: 'import'; spec: string }
	| { kind: 'set'; node: SyntaxNode }
	| { kind: 'show'; node: SyntaxNode; selector: SyntaxNode | null; transform: SyntaxNode };

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Parbreak', 'Semicolon']);

function readStatement(node: SyntaxNode, source: string): SetupStatement | null {
	if (node.name === 'ModuleImport') {
		const str = node.getChild('Str');
		const spec = str ? unquote(source.slice(str.from, str.to)) : '';
		return spec.startsWith('@') ? { kind: 'import', spec } : null;
	}
	if (node.name === 'SetRule') return { kind: 'set', node };
	if (node.name === 'ShowRule') {
		const parts = partsOf(node).filter((k) => k.name !== 'Show');
		const colon = parts.findIndex((k) => k.name === 'Colon');
		const transform = parts[colon + 1];
		if (colon < 0 || !transform || colon > 1) return null;
		return { kind: 'show', node, selector: colon === 1 ? parts[0] : null, transform };
	}
	return null;
}

function statementsIn(kids: SyntaxNode[], source: string): SetupStatement[] | null {
	const out: SetupStatement[] = [];
	for (let i = 0; i < kids.length; i += 2) {
		const read = kids[i].name === 'Hash' && kids[i + 1] ? readStatement(kids[i + 1], source) : null;
		if (!read) return null;
		out.push(read);
	}
	return out;
}

function parseSetup(source: string): SetupStatement[] | null {
	if (!/^\s*(\/[/*]|#)/.test(source)) return null;
	const top = typstSyntax(source);
	if (hasSyntaxError(top)) return null;
	const statements = statementsIn(
		childrenOf(top).filter((k) => !QUIET.has(k.name)),
		source
	);
	return statements?.length ? statements : null;
}

const MOST_KEPT = 500;
const readSetups = new Map<string, SetupStatement[] | null>();

export function readSetup(source: string): SetupStatement[] | null {
	const known = readSetups.get(source);
	if (known !== undefined) return known;
	const statements = parseSetup(source);
	if (readSetups.size >= MOST_KEPT) readSetups.clear();
	readSetups.set(source, statements);
	return statements;
}
