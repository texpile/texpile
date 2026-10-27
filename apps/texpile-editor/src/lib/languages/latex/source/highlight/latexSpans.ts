import type { SyntaxNode, Tree } from '@lezer/common';
import { tags, type Tag } from '@lezer/highlight';
import { commandsWith } from '../../knowledge/commands/commandFacts';
import { commonCommand, commandNames, rolesOf } from '../../knowledge/calls/commandCalls';
import { commonEnvFacts, hasMathBody, isItemCommand } from '../../knowledge/environments/envFacts';
import { parser } from '../../syntax/parser';

export type HighlightKind = keyof typeof KIND_TAGS;

export const KIND_TAGS = {
	command: tags.function(tags.variableName),
	mathCommand: tags.special(tags.variableName),
	module: tags.moduleKeyword,
	list: tags.processingInstruction,
	keyword: tags.keyword,
	envName: tags.className,
	heading: tags.heading,
	labelName: tags.labelName,
	url: tags.url,
	mathDelim: tags.controlKeyword,
	mathText: tags.special(tags.string),
	monospace: tags.monospace,
	comment: tags.comment,
	brace: tags.brace,
	bracket: tags.bracket,
	operator: tags.operator,
	escape: tags.escape,
	linebreak: tags.contentSeparator
} satisfies Record<string, Tag>;

export type HighlightSpan = { from: number; to: number; kind: HighlightKind };

export type ReadText = (from: number, to: number) => string;

const HEADING = new Set(commandsWith('section'));
const MODULE = new Set(
	commandNames(['file', 'bibfile', 'bibstyle', 'package', 'class', 'library']).filter((name) =>
		commonCommand(name)?.args.some((a) => a.loads || rolesOf(a).some((r) => r === 'file' || r === 'bibfile' || r === 'bibstyle'))
	)
);
const KEYED = new Set(commandNames(['label', 'citekey']));
const URL = new Set(commandNames(['url']));
const ESCAPE = /^\\[%&#_{}$~^ ]$/;
const MATH_NODES = new Set(['InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath']);
const OPENERS = new Set(['Dollar', 'DoubleDollar', 'OpenDisplay', 'OpenInline']);
const CLOSERS = new Set(['CloseDisplay', 'CloseInline']);
const ENVIRONMENT_TOKENS = new Set(['BeginEnv', 'EndEnv', 'VerbatimBegin']);
const SIBLINGS_BACK = 60;
const LOOKAHEAD = 64;

type MathState = 'text' | 'inline' | 'other';

type Context = { read: ReadText; math: Map<number, MathState>; args: Map<number, HighlightKind | null> };

function nodeKey(node: SyntaxNode): number {
	return node.from * 64 + node.type.id;
}

function environmentName(read: ReadText, node: SyntaxNode): string {
	const begin = node.firstChild;
	return begin ? read(begin.from, begin.to).replace(/^\\begin\s*\{\s*|\s*\}$/g, '') : '';
}

function mathState(ctx: Context, node: SyntaxNode | null): MathState {
	if (!node) return 'text';
	const key = nodeKey(node);
	let found = ctx.math.get(key);
	if (found === undefined) {
		const outer = mathState(ctx, node.parent);
		if (node.name === 'InlineMath') found = outer === 'text' ? 'inline' : outer === 'inline' ? 'text' : outer;
		else if (MATH_NODES.has(node.name)) found = outer === 'text' ? 'other' : outer;
		else if (node.name === 'Environment' && outer === 'text' && hasMathBody(commonEnvFacts(environmentName(ctx.read, node))))
			found = 'other';
		else found = outer;
		ctx.math.set(key, found);
	}
	return found;
}

function inMath(ctx: Context, node: SyntaxNode | null): boolean {
	return mathState(ctx, node) !== 'text';
}

function markedArgument(ctx: Context, command: SyntaxNode, math: boolean): HighlightKind | null {
	const name = ctx.read(command.from + 1, command.to);
	const after = ctx.read(command.to, command.to + LOOKAHEAD).split('\n')[0];
	if (KEYED.has(name) && /^\*?\s*[[{]/.test(after)) return 'labelName';
	if (math) return null;
	if (HEADING.has(name) && /^\*?\s*[[{]/.test(after)) return 'heading';
	if (URL.has(name) && /^\s*\{/.test(after)) return 'url';
	return null;
}

function argumentKind(ctx: Context, group: SyntaxNode): HighlightKind | null {
	const key = nodeKey(group);
	if (ctx.args.has(key)) return ctx.args.get(key)!;
	const math = inMath(ctx, group.parent);
	let kind: HighlightKind | null = null;
	let sibling = group.prevSibling;
	for (let i = 0; sibling && i < SIBLINGS_BACK; i++, sibling = sibling.prevSibling) {
		const name = sibling.name;
		if (name === 'ControlWord' || name === 'OwnMathOpen' || name === 'OwnMathClose') {
			kind = markedArgument(ctx, sibling, inMath(ctx, sibling.parent));
			if (kind) break;
		} else if (name === 'Group' || name === 'UrlArgument' || name === 'Environment' || name === 'VerbatimEnvironment') break;
		else if (name === 'Text' && !math) {
			let text = ctx.read(sibling.from, sibling.to);
			if (sibling.prevSibling?.name === 'ControlWord' && sibling.prevSibling.to === sibling.from) text = text.replace(/^\*/, '');
			if (text.trim()) break;
		}
	}
	ctx.args.set(key, kind);
	return kind;
}

function argumentAround(ctx: Context, node: SyntaxNode): HighlightKind | null {
	let kind: HighlightKind | null = null;
	for (let n = node.parent; n; n = n.parent) if (n.name === 'Group') kind = argumentKind(ctx, n) ?? kind;
	return kind;
}

function outermostMath(ctx: Context, delimiter: SyntaxNode): boolean {
	const node = delimiter.parent;
	if (!node || !MATH_NODES.has(node.name)) return false;
	const outer = mathState(ctx, node.parent);
	return outer === 'text' || (outer === 'inline' && node.name === 'InlineMath');
}

function inVerbatim(node: SyntaxNode): boolean {
	for (let n: SyntaxNode | null = node; n?.parent; n = n.parent)
		if (n.parent.name === 'VerbatimEnvironment') return !['VerbatimBegin', 'EndEnv'].includes(n.name);
	return false;
}

function commandKind(ctx: Context, node: SyntaxNode, math: boolean): HighlightKind {
	const name = ctx.read(node.from + 1, node.to);
	const after = ctx.read(node.to, node.to + LOOKAHEAD).split('\n')[0];
	if ((name === 'begin' || name === 'end') && /^\s*\{/.test(after)) return 'keyword';
	if (math) return 'mathCommand';
	if (markedArgument(ctx, node, false)) return 'command';
	if (MODULE.has(name) && !/^[0-9_]/.test(after)) return 'module';
	if (isItemCommand(name)) return 'list';
	return 'command';
}

function lineSpans(ctx: Context, tree: Tree, from: number, to: number, out: HighlightSpan[]) {
	let run: { kind: HighlightKind; end: number } | null = null;
	let star: { kind: HighlightKind; end: number } | null = null;
	function push(a: number, b: number, kind: HighlightKind) {
		if (a < b) out.push({ from: a, to: b, kind });
	}
	function text(a: number, b: number, kind: HighlightKind) {
		const s = ctx.read(a, b);
		const lead = run && run.kind === kind && run.end === a ? 0 : s.length - s.trimStart().length;
		push(a + lead, b, kind);
		run = { kind, end: b };
	}
	tree.iterate({
		from,
		to,
		enter(ref) {
			const node = ref.node;
			if (node.firstChild || node.type.isError) return;
			const a = Math.max(node.from, from);
			const b = Math.min(node.to, to);
			if (a >= b) return;
			const name = node.name;
			if (name === 'VerbatimBody' || (inVerbatim(node) && name !== 'EndEnv')) {
				run = null;
				return push(a, b, 'monospace');
			}
			const math = inMath(ctx, node.parent);
			const arg = argumentAround(ctx, node);
			const starred = star?.end === node.from ? star.kind : null;
			star = null;
			if (name === 'Text') {
				let at = a;
				if (starred && ctx.read(a, a + 1) === '*') {
					push(a, a + 1, starred);
					at++;
				}
				if (arg) return text(at, b, arg);
				if (!math) run = null;
				const s = ctx.read(at, b);
				const split = math ? /&/g : /[&~]/g;
				let last = at;
				for (const m of s.matchAll(split)) {
					if (math) text(last, at + m.index, 'mathText');
					push(at + m.index, at + m.index + 1, m[0] === '&' ? 'operator' : 'escape');
					last = at + m.index + 1;
					run = null;
				}
				if (math) text(last, b, 'mathText');
				return;
			}
			if (name === 'OpenBracket' || name === 'CloseBracket') {
				if (arg) return text(a, b, arg);
				if (math) return text(a, b, 'mathText');
				run = null;
				return push(a, b, 'bracket');
			}
			run = null;
			if (name === 'Comment') return push(a, b, 'comment');
			if (name === 'UrlArgument') {
				push(a, a + 1, 'brace');
				text(a + 1, b - 1, math ? 'mathText' : 'url');
				run = null;
				return push(b - 1, b, 'brace');
			}
			if (name === '{' || name === '}') return push(a, b, 'brace');
			if (ENVIRONMENT_TOKENS.has(name)) {
				const m = /^(\\(?:begin|end))(\s*)(\{)(\s*)([^}]*)(\})$/.exec(ctx.read(node.from, node.to));
				if (!m) return;
				let at = node.from;
				for (const [part, kind] of [
					[m[1], 'keyword'],
					[m[2], null],
					[m[3], 'brace'],
					[m[4], null],
					[m[5], arg ?? 'envName'],
					[m[6], 'brace']
				] as [string, HighlightKind | null][]) {
					if (kind) push(Math.max(at, from), Math.min(at + part.length, to), kind);
					at += part.length;
				}
				return;
			}
			if (name === 'ControlWord' || name === 'OwnMathOpen' || name === 'OwnMathClose') {
				const kind = commandKind(ctx, node, math);
				push(a, b, kind);
				if (kind === 'command' || kind === 'mathCommand') star = { kind, end: node.to };
				return;
			}
			if (name === 'ControlSymbol') {
				const s = ctx.read(node.from, node.to);
				if (s[1] === '\n') return;
				return push(a, b, s === '\\\\' ? 'linebreak' : ESCAPE.test(s) ? 'escape' : math ? 'mathCommand' : 'command');
			}
			if (OPENERS.has(name) || CLOSERS.has(name)) {
				if (outermostMath(ctx, node)) return push(a, b, 'mathDelim');
				if (name === 'Dollar' || name === 'DoubleDollar') {
					push(a, b, 'mathText');
					run = null;
					return;
				}
				return push(a, b, math || OPENERS.has(name) ? 'mathCommand' : 'command');
			}
			if (name === 'Verb') {
				const name = /^\\[A-Za-z]+\*?/.exec(ctx.read(node.from, node.to))![0];
				push(a, Math.min(node.from + name.length, b), math ? 'mathCommand' : 'command');
				const wrap = math ? '$' : '';
				const s = wrap + ctx.read(node.from + name.length, node.to) + wrap;
				const at = node.from + name.length - wrap.length;
				for (const span of latexSpans(parser.parse(s), (x, y) => s.slice(x, y), wrap.length, s.length - wrap.length))
					push(Math.max(at + span.from, from), Math.min(at + span.to, to), span.kind);
			}
		}
	});
}

export function latexSpans(tree: Tree, read: ReadText, from: number, to: number): HighlightSpan[] {
	const ctx: Context = { read, math: new Map(), args: new Map() };
	const out: HighlightSpan[] = [];
	let start = from;
	for (const line of read(from, to).split('\n')) {
		if (line) lineSpans(ctx, tree, start, start + line.length, out);
		start += line.length + 1;
	}
	return out;
}
