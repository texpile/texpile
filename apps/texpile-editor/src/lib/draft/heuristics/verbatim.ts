import { commandNames } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { verbatimArgumentEnd, verbatimArgumentStart, verbatimCommandAlternation } from '$lib/languages/latex/knowledge/calls/verbatimCalls';
import { commonEnvNames, envNameAlternation, hasLiteralBody } from '$lib/languages/latex/knowledge/environments/envFacts';

// Commands and environments that change catcodes WHILE TeX scans their argument (\verb's
// delimited body, \url's specials, verbatim env bodies). No static catcode table can see
// inside them; the names come from the package data.
// The lexing guards mask these spans before scanning; the DISPATCHED text still ships raw,
// and the engine applies the true dynamic catcodes.

// argument brace-delimited; TeX keeps braces grouping inside, so a matching-brace scan IS
// the engine's own parse. Only the FIRST braced argument is verbatim-read.
const BRACED_CMDS = commandNames(['url']);
// env bodies run to the literal \end{env}; nothing inside nests
const ENV_NAMES = commonEnvNames(hasLiteralBody);
const VERB_ENV_NAMES = new Set(ENV_NAMES);
const ENV_ALTERNATION = envNameAlternation(ENV_NAMES);

const DELIM_RE = new RegExp(`\\\\(${verbatimCommandAlternation()})(?![a-zA-Z])`, 'g');
const BRACED_RE = new RegExp(`\\\\(?:${BRACED_CMDS.join('|')})(?![a-zA-Z])\\s*\\{`, 'g');
const ENV_RE = new RegExp(`\\\\begin\\{(${ENV_ALTERNATION})\\}`, 'g');

export function isVerbatimEnv(name: string): boolean {
	return VERB_ENV_NAMES.has(name);
}

export type Span = { start: number; end: number };

/** [start, end) spans of verbatim-scanned material in s (bodies only, delimiters included) */
export function verbatimSpans(s: string): Span[] {
	const out: Span[] = [];
	DELIM_RE.lastIndex = 0;
	for (let m = DELIM_RE.exec(s); m; m = DELIM_RE.exec(s)) {
		const start = verbatimArgumentStart(s, DELIM_RE.lastIndex, m[1]);
		if (start < 0) continue;
		const end = verbatimArgumentEnd(s, start, m[1]);
		if (end < 0) continue;
		out.push({ start, end });
		DELIM_RE.lastIndex = end;
	}
	BRACED_RE.lastIndex = 0;
	for (let m = BRACED_RE.exec(s); m; m = BRACED_RE.exec(s)) {
		let depth = 1;
		let i = BRACED_RE.lastIndex;
		while (i < s.length && depth > 0) {
			if (s[i] === '{') depth++;
			else if (s[i] === '}') depth--;
			i++;
		}
		out.push({ start: BRACED_RE.lastIndex, end: depth === 0 ? i - 1 : s.length });
	}
	ENV_RE.lastIndex = 0;
	for (let m = ENV_RE.exec(s); m; m = ENV_RE.exec(s)) {
		const close = s.indexOf(`\\end{${m[1]}}`, ENV_RE.lastIndex);
		out.push({ start: ENV_RE.lastIndex, end: close < 0 ? s.length : close });
		if (close >= 0) ENV_RE.lastIndex = close;
	}
	return out.sort((a, b) => a.start - b.start);
}

/** s with verbatim bodies blanked to spaces (newlines kept, so line structure survives) */
export function maskVerbatim(s: string): string {
	const spans = verbatimSpans(s);
	if (!spans.length) return s;
	const chars = s.split('');
	for (const { start, end } of spans) for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
	return chars.join('');
}
