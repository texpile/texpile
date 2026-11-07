// what a Typst raw chip is, read off Typst's own tree: the statements it holds, each named by what it calls or sets
import type { SyntaxNode } from '@lezer/common';
import { TypstParser } from 'texpile-typst-syntax-wasm';

const QUIET = new Set(['Space', 'Parbreak', 'LineComment', 'BlockComment', 'Semicolon']);

const CODE_HEADS: Record<string, string> = {
	Conditional: '#if',
	ForLoop: '#for',
	WhileLoop: '#while',
	CodeBlock: '#{...}',
	ContentBlock: '#[...]',
	Parenthesized: '#(...)',
	Array: '#(...)',
	Dict: '#(...)',
	Str: '#"..."',
	ModuleInclude: '#include',
	Closure: '#(..) =>'
};

export type ChipStatement = {
	head: string;
	/** the name a call or a read starts with, which the paper, a package or Typst binds */
	root: string | null;
	/** a few words more: a set rule's arguments, an import's path, a let's names */
	detail: string;
};

let parser: TypstParser | null = null;

export function typstTree(source: string) {
	parser ??= new TypstParser();
	return parser.parse(source);
}

function kids(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

function significant(node: SyntaxNode): SyntaxNode[] {
	return kids(node).filter((k) => !QUIET.has(k.name));
}

/** `cetz.canvas`, `counter(..).display`, `heading.where` */
export function calleeName(node: SyntaxNode, src: string): string {
	if (node.name === 'Ident' || node.name === 'MathIdent') return src.slice(node.from, node.to);
	if (node.name === 'FieldAccess') {
		const parts = kids(node);
		const last = parts[parts.length - 1];
		return `${calleeName(parts[0], src)}.${src.slice(last.from, last.to)}`;
	}
	if (node.name === 'FuncCall' && node.firstChild) return `${calleeName(node.firstChild, src)}(..)`;
	return node.name;
}

export function rootName(node: SyntaxNode, src: string): string | null {
	if (node.name === 'Ident') return src.slice(node.from, node.to);
	if ((node.name === 'FieldAccess' || node.name === 'FuncCall') && node.firstChild) return rootName(node.firstChild, src);
	return null;
}

function namedArgs(call: SyntaxNode, src: string): string {
	const args = call.getChild('Args');
	if (!args) return '';
	return kids(args)
		.filter((k) => k.name === 'Named')
		.map((k) => (k.firstChild ? src.slice(k.firstChild.from, k.firstChild.to) : ''))
		.join(', ');
}

/** a call's arguments by shape: each positional one by its kind (a call by its name), then the named ones by name */
function argShape(call: SyntaxNode, src: string): string {
	const args = call.getChild('Args');
	if (!args) return '';
	const positional = significant(args)
		.filter((k) => !['LeftParen', 'RightParen', 'Comma', 'Named'].includes(k.name))
		.map((k) => (k.name === 'FuncCall' && k.firstChild ? `${calleeName(k.firstChild, src)}(..)` : k.name));
	const named = namedArgs(call, src);
	return [positional.join(' '), named].filter(Boolean).join('; ');
}

function setStatement(rule: SyntaxNode, src: string): ChipStatement {
	const target = significant(rule).find((k) => k.name !== 'Set');
	const name = target ? calleeName(target, src) : '?';
	const conditional = rule.getChild('If') ? ' if' : '';
	return { head: `#set ${name}`, root: target ? rootName(target, src) : null, detail: namedArgs(rule, src) + conditional };
}

function transformOf(node: SyntaxNode | undefined, src: string): string {
	if (!node) return '?';
	if (node.name === 'FuncCall' || node.name === 'Ident' || node.name === 'FieldAccess') return calleeName(node, src);
	if (node.name === 'SetRule') return setStatement(node, src).head.slice(1);
	return node.name;
}

function showStatement(rule: SyntaxNode, src: string): ChipStatement {
	const parts = significant(rule).filter((k) => k.name !== 'Show');
	const colon = parts.findIndex((k) => k.name === 'Colon');
	const selector = colon > 0 ? parts[0] : null;
	const transform = parts[colon + 1];
	if (!selector) return { head: `#show: ${transformOf(transform, src)}`, root: transform ? rootName(transform, src) : null, detail: '' };
	const name =
		selector.name === 'Str'
			? '"..."'
			: selector.name === 'Label'
				? '<label>'
				: selector.name === 'FuncCall' && calleeName(selector, src) === 'regex'
					? 'regex(..)'
					: calleeName(selector, src);
	return { head: `#show ${name}`, root: rootName(selector, src), detail: transformOf(transform, src) };
}

function letStatement(binding: SyntaxNode, src: string): ChipStatement {
	const bound = significant(binding).find((k) => k.name !== 'Let');
	if (bound?.name === 'Closure') {
		const name = bound.getChild('Ident');
		return { head: '#let function', root: null, detail: name ? src.slice(name.from, name.to) : '' };
	}
	if (bound?.name === 'Ident') {
		const value = significant(binding).slice(-1)[0];
		const kind = value?.name === 'Closure' ? '#let function' : '#let value';
		return { head: kind, root: null, detail: src.slice(bound.from, bound.to) };
	}
	return { head: '#let destructuring', root: null, detail: bound ? src.slice(bound.from, bound.to).slice(0, 30) : '' };
}

function importStatement(stmt: SyntaxNode, src: string): ChipStatement {
	const path = stmt.getChild('Str');
	const spec = path ? src.slice(path.from + 1, path.to - 1) : '';
	const pkg = /^@(\w+)\/([\w-]+):/.exec(spec);
	return { head: pkg ? `#import @${pkg[1]}/${pkg[2]}` : '#import local', root: null, detail: pkg ? spec : spec.slice(0, 40) };
}

function codeStatement(node: SyntaxNode, src: string): ChipStatement {
	switch (node.name) {
		case 'FuncCall':
			return { head: `#${calleeName(node.firstChild!, src)}(..)`, root: rootName(node, src), detail: argShape(node, src) };
		case 'Ident':
		case 'FieldAccess':
			return { head: `#${calleeName(node, src)}`, root: rootName(node, src), detail: '' };
		case 'SetRule':
			return setStatement(node, src);
		case 'ShowRule':
			return showStatement(node, src);
		case 'LetBinding':
			return letStatement(node, src);
		case 'ModuleImport':
			return importStatement(node, src);
		case 'Contextual': {
			const inner = significant(node).find((k) => k.name !== 'Context');
			const what = inner ? codeStatement(inner, src) : null;
			return { head: '#context', root: what?.root ?? null, detail: what?.head.slice(1) ?? '' };
		}
		default:
			return { head: CODE_HEADS[node.name] ?? `#${node.name}`, root: null, detail: '' };
	}
}

/** the statements of a chip, in order: code after a #, or a piece of markup by its kind. A chip holding code without
 *  its # (an argument of a call the editor draws, such as a figure's body) reads as that code */
export function chipStatements(text: string): ChipStatement[] {
	const source = /^\s*[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*[([]/.test(text) ? `#${text.trimStart()}` : text;
	const top = typstTree(source).topNode;
	const parts = kids(top);
	const out: ChipStatement[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (QUIET.has(part.name)) continue;
		if (part.name === 'Hash' && parts[i + 1]) {
			out.push(codeStatement(parts[++i], source));
			continue;
		}
		if (part.name === 'Text' && out.length) continue;
		out.push({ head: `markup ${part.name}`, root: null, detail: '' });
	}
	return out;
}

/** a chip that is one statement and nothing else beside comments, a label or a semicolon */
export function isAlone(statements: ChipStatement[]): boolean {
	return statements.filter((s) => s.head !== 'markup Label').length === 1;
}
