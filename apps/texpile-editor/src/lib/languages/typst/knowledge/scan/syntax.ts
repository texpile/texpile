import type { SyntaxNode } from '@lezer/common';
import { TypstParser } from 'texpile-typst-syntax-wasm';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon', 'Hash', 'Parbreak']);

let parser: TypstParser | null = null;

export function typstTop(source: string): SyntaxNode {
	parser ??= new TypstParser();
	return parser.parse(source).topNode;
}

export function childrenOf(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

export function hasSyntaxError(node: SyntaxNode): boolean {
	if (node.name === 'Error') return true;
	for (let c = node.firstChild; c; c = c.nextSibling) if (hasSyntaxError(c)) return true;
	return false;
}

export function partsOf(node: SyntaxNode): SyntaxNode[] {
	return childrenOf(node).filter((c) => !QUIET.has(c.name));
}

export function markupPartsOf(node: SyntaxNode): SyntaxNode[] {
	return childrenOf(node).filter((c) => c.name === 'Parbreak' || !QUIET.has(c.name));
}

export function textOf(node: SyntaxNode, source: string): string {
	return source.slice(node.from, node.to);
}

export function strValue(node: SyntaxNode, source: string): string {
	const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"' };
	return textOf(node, source)
		.slice(1, -1)
		.replace(/\\(u\{([0-9a-fA-F]+)\}|.)/g, (whole, what: string, hex?: string) =>
			hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : (escapes[what] ?? whole)
		);
}
