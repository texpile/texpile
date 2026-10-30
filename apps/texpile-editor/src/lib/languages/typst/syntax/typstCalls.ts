import type { SyntaxNode, Tree } from '@lezer/common';

const PUNCTUATION = new Set(['LeftParen', 'RightParen', 'Comma', 'Space', 'Colon', 'LineComment', 'BlockComment']);

/** the text a string literal, quotes and all, stands for */
export function unquoted(literal: string): string {
	return literal.slice(1, -1).replace(/\\u\{([0-9a-fA-F]+)\}|\\(.)/gs, (_all, hex: string | undefined, ch: string) => {
		if (hex) return String.fromCodePoint(parseInt(hex, 16));
		return ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch;
	});
}

export function stringValue(node: SyntaxNode, src: string): string {
	return unquoted(src.slice(node.from, node.to));
}

export function calleeOf(call: SyntaxNode, src: string): string | null {
	const callee = call.firstChild;
	return callee?.name === 'Ident' ? src.slice(callee.from, callee.to) : null;
}

export function callsNamed(tree: Tree, src: string, names: ReadonlySet<string>): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	tree.iterate({
		enter: (n) => {
			if (n.name !== 'FuncCall') return;
			const name = calleeOf(n.node, src);
			if (name && names.has(name)) out.push(n.node);
		}
	});
	return out;
}

export function positionalArgs(call: SyntaxNode): SyntaxNode[] {
	const args = call.getChild('Args');
	const out: SyntaxNode[] = [];
	for (let c = args?.firstChild ?? null; c; c = c.nextSibling) if (!PUNCTUATION.has(c.name) && c.name !== 'Named') out.push(c);
	return out;
}

export function namedArg(call: SyntaxNode, src: string, key: string): SyntaxNode | null {
	for (let c = call.getChild('Args')?.firstChild ?? null; c; c = c.nextSibling) {
		if (c.name !== 'Named') continue;
		const name = c.firstChild;
		if (name && src.slice(name.from, name.to) === key) return c.lastChild;
	}
	return null;
}

/** the strings a value is: one string, or an array of them */
export function stringsOf(value: SyntaxNode | null, src: string): string[] {
	if (!value) return [];
	if (value.name === 'Str') return [stringValue(value, src)];
	if (value.name === 'Parenthesized') return stringsOf(value.getChild('Str'), src);
	if (value.name !== 'Array') return [];
	return value.getChildren('Str').map((s) => stringValue(s, src));
}
