// the delimiter scan behind the math context: $/$$, \(/\), \[/\] and math environments, with the document's own
// commands and environments expanded where they carry delimiters
import { hasLiteralBody, holdsMath, type EnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';

/** the commands and environments the document defines that carry math delimiters; the rest read as plain text */
export type UserMathDefinitions = {
	macro: (name: string) => { body: string; takesArguments: boolean } | null;
	environment: (name: string) => { begin: string; end: string } | null;
};

export type MathScan = { math: boolean; sound: boolean; literal: boolean };

// \\ first so a linebreak never swallows the backslash of an escaped \$; then escapes, then the rest
const TOKEN = /\\\\|\\[$%]|\\([[\]()])|\\(begin|end)\{([a-zA-Z*]+)\}|\\([A-Za-z@]+)|\$\$?|%[^\n]*/g;

const MAX_EXPANSION = 4;

/** whether the arguments of the command that ends at `from` run past the end of `text` */
function leavesArgumentOpen(text: string, from: number): boolean {
	let i = from;
	for (;;) {
		while (i < text.length && /\s/.test(text[i])) i++;
		if (text[i] === '[') {
			const close = text.indexOf(']', i);
			if (close < 0) return true;
			i = close + 1;
		} else if (text[i] === '{') {
			let depth = 0;
			let j = i;
			for (; j < text.length; j++) {
				if (text[j] === '\\') j++;
				else if (text[j] === '{') depth++;
				else if (text[j] === '}' && --depth === 0) break;
			}
			if (j >= text.length) return true;
			i = j + 1;
		} else return false;
	}
}

/** sound: every closer met had its opener, no verbatim body is left open and no definition of the document is beyond reading */
export function scanMath(text: string, factsOf: (name: string) => EnvFacts, own?: UserMathDefinitions): MathScan {
	let envDepth = 0;
	let literal = 0;
	let inline = false;
	let display = false;
	let sound = true;
	function run(source: string, depth: number) {
		for (const m of source.matchAll(TOKEN)) {
			const tok = m[0];
			if (literal) {
				if (m[2] === 'end' && hasLiteralBody(factsOf(m[3]))) literal--;
				continue;
			}
			if (tok === '\\\\' || tok === '\\$' || tok === '\\%' || tok[0] === '%') continue;
			if (m[4]) {
				const macro = own?.macro(m[4]);
				if (!macro) continue;
				// the argument of a command that wraps its argument in math is beyond reading
				if (depth >= MAX_EXPANSION || (depth === 0 && macro.takesArguments && leavesArgumentOpen(source, m.index + tok.length)))
					sound = false;
				else run(macro.body, depth + 1);
			} else if (m[1]) {
				if (m[1] === '(') {
					sound &&= !inline;
					inline = true;
				} else if (m[1] === ')') {
					sound &&= inline;
					inline = false;
				} else if (m[1] === '[') display = true;
				else {
					sound &&= display;
					display = false;
				}
			} else if (m[2]) {
				const defined = own?.environment(m[3]);
				if (defined) {
					if (depth >= MAX_EXPANSION) sound = false;
					else run(m[2] === 'begin' ? defined.begin : defined.end, depth + 1);
					continue;
				}
				const facts = factsOf(m[3]);
				if (m[2] === 'begin' && hasLiteralBody(facts)) literal++;
				else if (!holdsMath(facts)) continue;
				else if (m[2] === 'begin') envDepth++;
				else {
					sound &&= envDepth > 0;
					envDepth = Math.max(0, envDepth - 1);
				}
			} else if (tok === '$$') display = !display;
			else if (tok === '$') inline = !inline;
		}
	}
	run(text, 0);
	return { math: envDepth > 0 || inline || display, sound: sound && !literal, literal: literal > 0 };
}
