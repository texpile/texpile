// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out
import type { SyntaxNode, Tree } from '@lezer/common';
import { commonEnvFacts, hasUnreadBody } from '$lib/languages/latex/knowledge/environments/envFacts';
import { argumentsEnd } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { latexTreeOf } from './syntax/latexTrees';
import { environmentName } from './syntax/treeMode';

const IFFALSE = '\\iffalse';
const FI = /\\fi$/;

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

/** 'comments' blanks nothing else; `openings` keeps the \begin, its options and the \end of a blanked environment */
export type UnreadMask = { masked: 'all' | 'comments'; openings: boolean };

function unreadSpans(tex: string, tree: Tree, { masked, openings }: UnreadMask): [number, number][] {
	function environmentSpan(env: SyntaxNode): [number, number] | null {
		const begin = env.firstChild;
		const end = env.lastChild;
		if (!begin || !end || end === begin || end.name !== 'EndEnv') return null;
		const facts = commonEnvFacts(environmentName(tex, begin));
		if (!hasUnreadBody(facts)) return null;
		// keeping the \end lets a reader that parses the masked text see the environment close
		return openings ? [Math.min(argumentsEnd(tex, begin.to, facts.args ?? []), end.from), end.from] : [begin.from, end.to];
	}
	const spans: [number, number][] = [];
	tree.iterate({
		enter(node) {
			if (node.name === 'Comment') spans.push([node.from, node.to]);
			else if (node.name === 'Skipped') {
				// what TeX skips still has comments and verbatim text of its own, read the way the rest is
				const from = node.from + IFFALSE.length;
				const to = FI.test(tex.slice(from, node.to)) ? node.to - 3 : node.to;
				const inner = tex.slice(from, to);
				for (const [a, b] of unreadSpans(inner, latexTreeOf(inner), { masked, openings })) spans.push([from + a, from + b]);
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

/** comments, verbatim and skipped bodies blanked, so a commented \begin opens nothing and a % in a URL stays a character */
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
	const spans: [number, number][] = [];
	latexTreeOf(tex).iterate({ enter: (node) => void (node.name === 'Skipped' && spans.push([node.from, node.to])) });
	return blankSpans(read, spans);
}

/** the commented-out code of a text alone, everything else blanked */
export function remarkCode(tex: string): string {
	const spans: [number, number][] = [];
	let at = 0;
	latexTreeOf(tex).iterate({
		enter(node) {
			if (node.name !== 'Comment' && node.name !== 'Skipped') return;
			let from = node.from;
			let to = node.to;
			if (node.name === 'Comment') while (tex[from] === '%' && from < to) from++;
			else {
				from += IFFALSE.length;
				if (FI.test(tex.slice(from, to))) to -= 3;
			}
			spans.push([at, from]);
			at = to;
		}
	});
	spans.push([at, tex.length]);
	return blankSpans(tex, spans);
}
