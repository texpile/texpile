import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';

// Commands and environments that change catcodes WHILE TeX scans their argument (\verb's
// delimited body, \url's specials, verbatim env bodies). No static catcode table can see
// inside them; the syntax tree reads them from the package data.
// The lexing guards mask these spans before scanning; the DISPATCHED text still ships raw,
// and the engine applies the true dynamic catcodes.

const COMMAND_NAME = /^\\[A-Za-z@]+/;

type Span = { start: number; end: number };

/** [start, end) spans of verbatim-scanned material in s (bodies only, delimiters included) */
function verbatimSpans(s: string): Span[] {
	const out: Span[] = [];
	latexTreeOf(s).iterate({
		enter(node) {
			if (node.name === 'Verb') {
				out.push({ start: node.from + (COMMAND_NAME.exec(s.slice(node.from, node.to))?.[0].length ?? 1), end: node.to });
				return false;
			}
			if (node.name === 'UrlArgument') {
				out.push({ start: node.from + 1, end: node.to - 1 });
				return false;
			}
			if (node.name !== 'VerbatimEnvironment') return;
			const begin = node.node.firstChild;
			const last = node.node.lastChild;
			if (begin) out.push({ start: begin.to, end: last?.name === 'EndEnv' ? last.from : s.length });
			return false;
		}
	});
	return out;
}

/** s with verbatim bodies blanked to spaces (newlines kept, so line structure survives) */
export function maskVerbatim(s: string): string {
	const spans = verbatimSpans(s);
	if (!spans.length) return s;
	const chars = s.split('');
	for (const { start, end } of spans) for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
	return chars.join('');
}
