// the import's readers of the syntax tree: children, string values, what ends an expression
import type { SyntaxNode } from '@lezer/common';

export function children(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

export function childOf(node: SyntaxNode, name: string): SyntaxNode | null {
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
	return null;
}

// code expressions that configure the document or bind names: typst wants them terminated by a
// line end or a semicolon, so they are always their own raw block
export const DECLARATION_KINDS = new Set(['ModuleImport', 'ModuleInclude', 'LetBinding', 'SetRule', 'ShowRule']);

export const EXPRESSION_KINDS = new Set(['Conditional', 'ForLoop', 'WhileLoop', 'Contextual', 'CodeBlock']);

export function expressionEnd(nodes: SyntaxNode[], at: number, src: string): number {
	const after = nodes[at + 1];
	if (after?.name === 'Semicolon' || (after?.name === 'Error' && after.to > after.from)) return at + 1;
	const spaced = after?.name === 'Space' && !/[\r\n]/.test(src.slice(after.from, after.to));
	return spaced && DECLARATION_KINDS.has(nodes[at].name) && nodes[at + 2]?.name === 'Semicolon' ? at + 2 : at;
}

// shorthands become the character the reader sees; the reverse direction needs no mapping
// because the character itself is valid Typst text
export const SHORTHANDS: Record<string, string> = {
	'--': '\u2013',
	'---': '\u2014',
	'...': '\u2026',
	'~': '\u00a0',
	'-?': '\u00ad'
};

export function unescape(slice: string): string {
	const u = /^\\u\{([0-9a-fA-F]+)\}$/.exec(slice);
	if (u) {
		try {
			return String.fromCodePoint(parseInt(u[1], 16));
		} catch {
			return slice;
		}
	}
	return slice.length >= 2 && slice[0] === '\\' ? slice.slice(1) : slice;
}

export function equationInner(eq: SyntaxNode, src: string): string {
	const ds = children(eq).filter((c) => c.name === 'Dollar');
	if (ds.length >= 2) return src.slice(ds[0].to, ds[ds.length - 1].from);
	return src.slice(eq.from, eq.to).replace(/^\$|\$$/g, '');
}

const STR_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

export function unquote(str: string): string {
	const inner = str.startsWith('"') && str.endsWith('"') && str.length >= 2 ? str.slice(1, -1) : str;
	return inner.replace(/\\u\{([0-9a-fA-F]+)\}|\\(.)/gs, (whole, hex: string | undefined, ch: string | undefined) => {
		if (hex != null) {
			try {
				return String.fromCodePoint(parseInt(hex, 16));
			} catch {
				return whole;
			}
		}
		return ch != null && ch in STR_ESCAPES ? STR_ESCAPES[ch] : whole;
	});
}

export const CALL_PUNCT = ['LeftParen', 'RightParen', 'Comma', 'Space'];

export function isDisplayEquation(eq: SyntaxNode): boolean {
	const kids = children(eq);
	return kids.length >= 3 && kids[1].name === 'Space' && kids[kids.length - 2].name === 'Space';
}
