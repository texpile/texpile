// LaTeX masking for harper: blank out markup so only prose reaches the linter, keeping every
// offset identical to the source (masked chars become spaces). Ported from upstream harper-tex's
// Masker (scratch/harper/harper-tex/src/masker.rs), with tighter comment/math/verbatim handling.

import { callAt, rolesOf, type CallArgument, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { verbatimCallEnd, verbatimCommandNames } from '$lib/languages/latex/knowledge/calls/verbatimCalls';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { codeOnly } from '$lib/languages/latex/texCode';

// alltt is the one body with prose in it
function hasNonProseBody(env: string): boolean {
	const { body } = commonEnvFacts(env);
	return !!body && body !== 'literal';
}

const VERBATIM_COMMANDS = new Set(verbatimCommandNames());

// texttt holds code-like words, which harper flags and a word count would not want
const CODE_LIKE_COMMANDS = new Set(['texttt']);

// a short title is not prose: it stays out of the spellcheck and the word count
function isProseArgument(call: CommandCall, a: CallArgument): boolean {
	return rolesOf(a.arg).includes('text') && a.arg.part !== 'short' && a.arg.mode !== 'math' && !CODE_LIKE_COMMANDS.has(call.command);
}

function isLetter(c: string) {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

export type TexMask = {
	/** source with every masked char replaced by a space; same length as the input */
	text: string;
	/** merged [from, to) masked ranges, sorted — lints overlapping any of these are synthetic */
	spans: [number, number][];
};

export function maskTex(src: string): TexMask {
	const n = src.length;
	const m = new Uint8Array(n);
	function mask(from: number, to: number) {
		return m.fill(1, Math.max(0, from), Math.min(n, to));
	}

	// balanced {...} starting at an opening brace; -1 when unterminated
	function matchBrace(open: number): number {
		let depth = 0;
		for (let k = open; k < n; k++) {
			const c = src[k];
			if (c === '\\') k++;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) return k;
		}
		return -1;
	}

	// \name*[opt] anatomy at a backslash; curlyAt = position of a directly following '{'
	function readCommand(at: number): { name: string; afterOpt: number; curlyAt: number } | null {
		if (at + 1 >= n) return null;
		let k = at + 1;
		let name = src[k++];
		while (k < n && isLetter(src[k])) name += src[k++];
		if (src[k] === '*') {
			name += '*';
			k++;
		}
		let afterOpt = k;
		if (src[afterOpt] === '[') {
			const close = src.indexOf(']', afterOpt + 1);
			if (close >= 0) afterOpt = close + 1;
		}
		return { name, afterOpt, curlyAt: src[afterOpt] === '{' ? afterOpt : -1 };
	}

	// where the verbatim call at `at` ends, -1 when the call has none
	function verbatimEnd(at: number, name: string): number {
		const bare = name.replace(/\*$/, '');
		return VERBATIM_COMMANDS.has(bare) ? verbatimCallEnd(src, at + 1 + bare.length, bare) : -1;
	}

	const code = codeOnly(src);
	// where each prose argument of a call being scanned ends, and where the scan resumes
	const resume: { to: number; next: number }[] = [];

	// masks the call except the insides of its prose arguments; returns where the scan goes on
	function maskCall(call: CommandCall): number {
		const prose = call.args.filter((a) => isProseArgument(call, a));
		let at = call.at;
		for (const a of prose) {
			mask(at, a.from);
			at = a.to;
		}
		mask(at, call.end);
		for (let k = prose.length - 1; k >= 0; k--) resume.push({ to: prose[k].to, next: prose[k + 1]?.from ?? call.end });
		return prose.length ? prose[0].from : call.end;
	}

	let i = 0;
	while (i < n) {
		const pending = resume[resume.length - 1];
		if (pending && i >= pending.to) {
			resume.pop();
			if (i === pending.to) i = pending.next;
			continue;
		}
		const c = src[i];
		if (c === '%') {
			// TeX comments hide the rest of the line AND consume the newline (lines join)
			const eol = src.indexOf('\n', i);
			const j = eol < 0 ? n : eol + 1;
			mask(i, j);
			i = j;
		} else if (c === '\n') {
			// indentation is layout, not prose; the newline itself stays visible so harper
			// keeps its sentence/paragraph boundaries
			let j = i + 1;
			while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
			if (j > i + 1) mask(i + 1, j);
			i = j;
		} else if (c === '$') {
			const dbl = src[i + 1] === '$';
			const close = src.indexOf(dbl ? '$$' : '$', i + (dbl ? 2 : 1));
			const j = close < 0 ? n : close + (dbl ? 2 : 1);
			mask(i, j);
			i = j;
		} else if (c === '\\') {
			const cmd = readCommand(i);
			if (!cmd) {
				mask(i, i + 1);
				i++;
				continue;
			}
			const { name, afterOpt, curlyAt } = cmd;
			const call = callAt(code, i);
			const verbatimTo = verbatimEnd(i, name);
			if (name === '(' || name === '[') {
				// inline/display math shorthand: mask through the matching closer
				const closer = name === '(' ? '\\)' : '\\]';
				const close = src.indexOf(closer, i + 2);
				const j = close < 0 ? n : close + 2;
				mask(i, j);
				i = j;
			} else if (verbatimTo >= 0) {
				mask(i, verbatimTo);
				i = verbatimTo;
			} else if (name === 'begin' && curlyAt >= 0) {
				const envClose = src.indexOf('}', curlyAt + 1);
				const env = envClose < 0 ? '' : src.slice(curlyAt + 1, envClose);
				if (hasNonProseBody(env)) {
					const end = src.indexOf(`\\end{${env}}`, envClose + 1);
					const j = end < 0 ? n : end + 6 + env.length;
					mask(i, j);
					i = j;
				} else {
					// mask \begin{env} plus its argument groups ({ll} col specs, [t] placements)
					let j = envClose < 0 ? n : envClose + 1;
					for (;;) {
						if (src[j] === '[') {
							const close = src.indexOf(']', j + 1);
							if (close < 0) break;
							j = close + 1;
						} else if (src[j] === '{') {
							const close = matchBrace(j);
							if (close < 0) break;
							j = close + 1;
						} else break;
					}
					mask(i, j);
					i = j;
				}
			} else if (call) {
				i = maskCall(call);
			} else if (curlyAt >= 0) {
				const close = matchBrace(curlyAt);
				if (close >= 0) {
					mask(i, close + 1);
					i = close + 1;
				} else {
					mask(i, curlyAt);
					i = curlyAt;
				}
			} else {
				mask(i, afterOpt);
				i = afterOpt;
			}
		} else if (c === '{' || c === '}' || c === '~' || c === '&' || c === '#' || c === '^' || c === '_') {
			mask(i, i + 1);
			i++;
		} else {
			i++;
		}
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
