// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out
import type { SyntaxNode, Tree } from '@lezer/common';
import { commonEnvFacts, hasUnreadBody, type EnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { argumentsEnd } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { latexTreeOf } from './syntax/latexTrees';
import { environmentName } from './syntax/treeMode';

function blank(s: string): string {
	return s.replace(/[^\n]/g, ' ');
}

function blankSpans(tex: string, spans: [number, number][]): string {
	let out = '';
	let at = 0;
	for (const [from, to] of spans) {
		if (from < at) continue;
		out += tex.slice(at, from) + blank(tex.slice(from, to));
		at = to;
	}
	return out + tex.slice(at);
}

type ControlSequence = { name: string; from: number; to: number };

function controlSequences(tree: Tree, tex: string): ControlSequence[] {
	const out: ControlSequence[] = [];
	tree.iterate({
		enter(node) {
			if (node.name === 'ControlWord' || node.name === 'ControlSymbol')
				out.push({ name: tex.slice(node.from + 1, node.to), from: node.from, to: node.to });
		}
	});
	return out;
}

/** each \iffalse through the \fi that closes it, or through the first \fi after it when none does */
function falseBlocks(tokens: ControlSequence[], read: string): [number, number][] {
	function adjacent(a: number, b: number): boolean {
		return /^[\s=]*$/.test(read.slice(tokens[a].to, tokens[b].from));
	}
	function is(k: number, name: string): boolean {
		return k >= 0 && tokens[k].name === name;
	}
	// a conditional \newif or \let only names (\let\ifdraft\iffalse) opens nothing
	function named(k: number): boolean {
		if ((is(k - 1, 'newif') || is(k - 1, 'let')) && adjacent(k - 1, k)) return true;
		return is(k - 2, 'let') && adjacent(k - 2, k - 1) && adjacent(k - 1, k);
	}
	const declared = new Set(tokens.filter((t, k) => is(k - 1, 'newif') && adjacent(k - 1, k)).map((t) => t.name));
	function conditional(k: number): boolean {
		return (commonFacts(tokens[k].name).conditional || declared.has(tokens[k].name)) && !named(k);
	}
	const blocks: [number, number][] = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].name !== 'iffalse' || named(i)) continue;
		let depth = 0;
		let firstFi = -1;
		let close = -1;
		for (let k = i; k < tokens.length && close < 0; k++) {
			if (tokens[k].name === 'fi') {
				if (firstFi < 0) firstFi = k;
				if (--depth === 0) close = k;
			} else if (conditional(k)) depth++;
		}
		const end = close >= 0 ? close : firstFi;
		if (end < 0) continue;
		blocks.push([tokens[i].from, tokens[end].to]);
		i = end;
	}
	return blocks;
}

/** 'verbatim' leaves comments and skipped bodies readable, 'comments' blanks nothing else; `openings` keeps the \begin and options of a blanked environment */
export type UnreadMask = { masked: 'all' | 'verbatim' | 'comments'; openings: boolean };

function unreadSpans(tex: string, tree: Tree, { masked, openings }: UnreadMask): [number, number][] {
	function unread(facts: EnvFacts): boolean {
		return masked === 'all' ? hasUnreadBody(facts) : facts.body === 'verbatim';
	}
	function environmentSpan(env: SyntaxNode): [number, number] | null {
		const begin = env.firstChild;
		const end = env.lastChild;
		if (!begin || !end || end === begin || end.name !== 'EndEnv') return null;
		const facts = commonEnvFacts(environmentName(tex, begin));
		if (!unread(facts)) return null;
		return [openings ? Math.min(argumentsEnd(tex, begin.to, facts.args ?? []), end.from) : begin.from, end.to];
	}
	const spans: [number, number][] = [];
	tree.iterate({
		enter(node) {
			if (node.name === 'Comment') {
				if (masked !== 'verbatim') spans.push([node.from, node.to]);
			} else if (masked === 'comments') return;
			else if (node.name === 'Verb') spans.push([node.from, node.to]);
			else if (node.name === 'VerbatimEnvironment') {
				const span = environmentSpan(node.node);
				if (span) spans.push(span);
				return false;
			}
		}
	});
	return spans;
}

/** comments, verbatim command text and verbatim or skipped bodies blanked, as the syntax tree reads them, so a commented
 * \begin opens nothing and a % in a URL stays a character */
export function blankUnread(tex: string, mask: UnreadMask = { masked: 'all', openings: false }): string {
	return blankSpans(tex, unreadSpans(tex, latexTreeOf(tex), mask));
}

export function blankComments(tex: string): string {
	return blankUnread(tex, { masked: 'comments', openings: false });
}

let lastRead: { tex: string; code: string } | null = null;

/** blanked with spaces, so offsets hold; the checks that run on one text share the work */
export function codeOnly(tex: string): string {
	if (lastRead?.tex === tex) return lastRead.code;
	const code = blankFalse(blankUnread(tex), tex);
	lastRead = { tex, code };
	return code;
}

/** the same, with the \begin line and options of a verbatim environment left readable (\begin{lstlisting}[label=a]) */
export function codeKeepingOpenings(tex: string): string {
	return blankFalse(blankUnread(tex, { masked: 'all', openings: true }), tex);
}

function blankFalse(read: string, tex: string): string {
	if (!read.includes('\\iffalse')) return read;
	return blankSpans(read, falseBlocks(controlSequences(latexTreeOf(tex), tex), read));
}
