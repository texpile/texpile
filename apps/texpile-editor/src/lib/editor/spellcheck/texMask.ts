// LaTeX masking for harper: blank out markup so only prose reaches the linter, keeping every
// offset identical to the source (masked chars become spaces). Ported from upstream harper-tex's
// Masker (scratch/harper/harper-tex/src/masker.rs), with tighter comment/math/verbatim handling.

import type { SyntaxNode } from '@lezer/common';
import { callAt, rolesOf, type CallArgument, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { commandTokensOf } from '$lib/languages/latex/syntax/commandTokens';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';
import { codeOnly } from '$lib/languages/latex/texCode';

// alltt is the one body with prose in it
function hasNonProseBody(env: string): boolean {
	const { body } = commonEnvFacts(env);
	return !!body && body !== 'literal';
}

// texttt holds code-like words, which harper flags and a word count would not want
const CODE_LIKE_COMMANDS = new Set(['texttt']);

// a short title is not prose: it stays out of the spellcheck and the word count
function isProseArgument(call: CommandCall, a: CallArgument): boolean {
	return rolesOf(a.arg).includes('text') && a.arg.part !== 'short' && a.arg.mode !== 'math' && !CODE_LIKE_COMMANDS.has(call.command);
}

export type TexMask = {
	/** source with every masked char replaced by a space; same length as the input */
	text: string;
	/** merged [from, to) masked ranges, sorted — lints overlapping any of these are synthetic */
	spans: [number, number][];
};

const WHOLLY_MASKED = new Set([
	'InlineMath',
	'DisplayMath',
	'BracketMath',
	'ParenMath',
	'OwnMath',
	'Verb',
	'Skipped',
	'UrlArgument',
	'EndEnv',
	'StrayEnd',
	'StrayClose',
	'StrayMath'
]);
const MARKUP_CHARS = /[~&#^_]/g;

type Mark = (from: number, to: number) => void;

function bracketEnd(node: SyntaxNode, at: number): number {
	let opened = false;
	for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
		if (sibling.from < at) continue;
		if (!opened) {
			if (sibling.from !== at || sibling.name !== 'OpenBracket') return -1;
			opened = true;
		} else if (sibling.name === 'CloseBracket') return sibling.to;
		else if (sibling.name === 'ParBreak') return -1;
	}
	return -1;
}

function argumentsEnd(src: string, closes: Int32Array, node: SyntaxNode, at: number): number {
	let end = at;
	for (;;) {
		const next = src[end] === '[' ? bracketEnd(node, end) : src[end] === '{' && closes[end] >= 0 ? closes[end] + 1 : -1;
		if (next < 0) return end;
		end = next;
	}
}

function markProse(src: string, mark: Mark): void {
	const code = codeOnly(src);
	const { closes } = commandTokensOf(src);

	function markCall(call: CommandCall) {
		let at = call.at;
		for (const a of call.args.filter((arg) => isProseArgument(call, arg))) {
			mark(at, a.from);
			at = a.to;
		}
		mark(at, call.end);
	}

	// \name*[opt]{group}: an unknown command takes the options and the group that touch it
	function markCommand(node: SyntaxNode) {
		let at = node.to;
		if (src[at] === '*') at++;
		if (src[at] === '[') {
			const end = bracketEnd(node, at);
			if (end >= 0) at = end;
		}
		mark(node.from, src[at] === '{' && closes[at] >= 0 ? closes[at] + 1 : at);
	}

	function markEnvironment(node: SyntaxNode): boolean {
		const begin = node.firstChild;
		if (!begin) return false;
		if (hasNonProseBody(environmentName(src, begin))) {
			mark(node.from, node.to);
			return false;
		}
		// the column specs and placements: {ll}, [t]
		mark(begin.from, argumentsEnd(src, closes, begin, begin.to));
		return true;
	}

	// alltt is the one verbatim body with prose in it
	function markVerbatim(node: SyntaxNode) {
		const body = node.node.getChild('VerbatimBody');
		if (!body || commonEnvFacts(environmentName(src, node.firstChild!)).body !== 'literal') {
			mark(node.from, node.to);
			return;
		}
		mark(node.from, body.from);
		mark(body.to, node.to);
		const text = src.slice(body.from, body.to);
		markProse(text, (from, to) => mark(body.from + from, body.from + to));
	}

	latexTreeOf(src).iterate({
		enter(node) {
			const { name } = node;
			if (name === 'Comment') {
				// TeX comments hide the rest of the line AND consume the newline (lines join)
				mark(node.from, src[node.to] === '\n' ? node.to + 1 : node.to);
			} else if (WHOLLY_MASKED.has(name)) {
				mark(node.from, node.to);
				return false;
			} else if (name === 'VerbatimEnvironment') {
				markVerbatim(node.node);
				return false;
			} else if (name === 'Environment') return markEnvironment(node.node);
			else if (name === 'ControlWord') {
				const call = callAt(code, node.from);
				if (call) markCall(call);
				else markCommand(node.node);
			} else if (name === 'ControlSymbol') markCommand(node.node);
			else if (name === 'Text') {
				for (const m of src.slice(node.from, node.to).matchAll(MARKUP_CHARS)) mark(node.from + m.index, node.from + m.index + 1);
			} else if (name === '{' || name === '}') mark(node.from, node.to);
		}
	});
}

export function maskTex(src: string): TexMask {
	const n = src.length;
	const m = new Uint8Array(n);
	markProse(src, (from, to) => m.fill(1, Math.max(0, from), Math.min(n, to)));
	// indentation is layout, not prose; the newline itself stays visible so harper keeps its sentence/paragraph boundaries
	for (let nl = src.indexOf('\n'); nl >= 0; nl = src.indexOf('\n', nl + 1)) {
		if (m[nl]) continue;
		let j = nl + 1;
		while (src[j] === ' ' || src[j] === '\t') j++;
		m.fill(1, nl + 1, j);
	}

	// build the output in runs, not per-char: each masked char becomes exactly one space, so the
	// result keeps the input's length and offsets, and runs give the merged spans for free
	const parts: string[] = [];
	const spans: [number, number][] = [];
	let k = 0;
	while (k < n) {
		const masked = m[k];
		let j = k + 1;
		while (j < n && m[j] === masked) j++;
		if (masked) {
			parts.push(' '.repeat(j - k));
			spans.push([k, j]);
		} else parts.push(src.slice(k, j));
		k = j;
	}
	return { text: parts.join(''), spans };
}

/** true when [from, to) overlaps any masked span (binary search; spans are sorted). */
export function overlapsMask(spans: [number, number][], from: number, to: number): boolean {
	let lo = 0,
		hi = spans.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [s, e] = spans[mid];
		if (e <= from) lo = mid + 1;
		else if (s >= to) hi = mid - 1;
		else return true;
	}
	return false;
}
