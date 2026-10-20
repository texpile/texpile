// math-context detection for completion ranking. a heuristic forward scan over a bounded window
// (the stex StreamLanguage tree has no math scope to ask), tracking $/$$, \(/\), \[/\] and math
// environments. isMathContext boosts math-flagged macros inside math and sinks them outside; modeAt answers only
// when the scan is sure, and the by-mode filter acts on that alone, so a wrong guess degrades to the flat ordering.
import type { EditorState } from '@codemirror/state';
import type { MacroCompletion } from '../packages/packageCompletions';
import { docText } from '$lib/editor/source/docText';
import { callsIn, enclosingCalls, rolesOf } from '../../knowledge/calls/commandCalls';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import type { Role } from '../../knowledge/types';
import { commonEnvFacts, loadedEnvFacts, type EnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { blankUnread } from '../../texCode';
import { NOT_DELIMITER, verbatimArgumentEnd, verbatimArgumentStart, verbatimCommandNames } from '../../knowledge/calls/verbatimCalls';
import { groupAt, primitiveDefsIn } from '../../userDefinitions';
import { documentReading } from '../signature/documentReadings';
import { scanMath } from './mathScan';
import { userMathDefinitions } from './userMathDefinitions';

const WINDOW = 4000;

const factsCache = new WeakMap<LoadedFile[], (name: string) => EnvFacts>();

// what the loaded packages say about an environment over the common reading
function factsOf(loaded: LoadedFile[] | null): (name: string) => EnvFacts {
	if (!loaded) return commonEnvFacts;
	let facts = factsCache.get(loaded);
	if (!facts) {
		const stacked = loadedEnvFacts(loaded);
		facts = (name) => (stacked[name] ? { ...commonEnvFacts(name), ...stacked[name] } : commonEnvFacts(name));
		factsCache.set(loaded, facts);
	}
	return facts;
}

/** true when pos sits inside $...$, \(...\), \[...\], $$...$$ or a math environment. */
export function isMathContext(state: EditorState, pos: number, loaded: LoadedFile[] | null = null): boolean {
	const text = readable(state.sliceDoc(Math.max(0, pos - WINDOW), pos));
	return scanMath(withoutDefinitions(text), factsOf(loaded), userMathDefinitions(docText(state.doc))).math;
}

export type CompletionMode = 'math' | 'text';

const BLANK_LINE = /\n[ \t]*\n/g;
const BEGIN_DOCUMENT = '\\begin{document}';
// the arguments that hold the document's own commands, written for either mode
const DEFINITION_ROLES: Role[] = ['body', 'begin', 'end'];
const DEFINITION_OPEN = /\\(?:[gex]?def|let)\s*\\[A-Za-z@]+[^{}\n]*=?\s*\{/g;

function blankSpans(text: string, spans: [number, number][]): string {
	let out = text;
	for (const [from, to] of spans) out = out.slice(0, from) + out.slice(from, to).replace(/[^\n]/g, ' ') + out.slice(to);
	return out;
}

// the text of a verbatim command, a link address and a comment holds no delimiter
function readable(raw: string): string {
	const text = blankUnread(raw);
	return blankSpans(
		text,
		callsIn(text, ['url']).flatMap((c) => c.args.filter((a) => rolesOf(a.arg).includes('url')).map((a): [number, number] => [a.from, a.to]))
	);
}

// a closed definition reads as plain text, so the \begin{equation} of a \newcommand opens nothing
function withoutDefinitions(text: string): string {
	const spans: [number, number][] = callsIn(text, DEFINITION_ROLES)
		.filter((call) => call.args.some((a) => rolesOf(a.arg).some((r) => DEFINITION_ROLES.includes(r))))
		.map((call) => [call.at, call.end]);
	for (const d of primitiveDefsIn(text)) {
		const body = d.bodyAt === null ? null : groupAt(text, d.bodyAt);
		if (body !== null && d.bodyAt !== null) spans.push([d.at, d.bodyAt + body.length + 2]);
	}
	return blankSpans(text, spans);
}

// the cursor is in the body of a \def, \gdef, \edef, \xdef or \let, which reads in either mode
function insideDefinitionBody(before: string): boolean {
	for (const m of [...before.matchAll(DEFINITION_OPEN)].slice(-3)) {
		if (groupAt(before, m.index + m[0].length - 1) === null) return true;
	}
	return false;
}

/** the mode at pos when it is certain: the arguments around it state it, or the delimiters since the paragraph began
 * pair up. null in a preamble, in a definition body and wherever the scan cannot tell. */
export function modeAt(state: EditorState, pos: number, loaded: LoadedFile[] | null = null): CompletionMode | null {
	const text = docText(state.doc);
	if (text.indexOf(BEGIN_DOCUMENT) > pos) return null;
	const before = readable(state.sliceDoc(Math.max(0, pos - WINDOW), pos));
	if (insideDefinitionBody(before)) return null;
	const facts = factsOf(loaded);
	const own = userMathDefinitions(text);
	for (const call of enclosingCalls(before, (name) => documentReading(loaded, text, name))) {
		if (rolesOf(call.arg.arg).some((r) => DEFINITION_ROLES.includes(r))) return null;
		const stated = call.arg.arg.mode;
		if (!stated) continue;
		// \textbf{ $\alpha: a text argument holds math of its own
		const inside = scanMath(before.slice(call.at + call.arg.from), facts, own);
		return inside.sound && inside.math ? 'math' : stated;
	}
	let paragraph = before;
	let cut = -1;
	for (const m of before.matchAll(BLANK_LINE)) cut = m.index + m[0].length;
	if (cut >= 0) paragraph = before.slice(cut);
	else if (pos > WINDOW) return null;
	const found = scanMath(withoutDefinitions(paragraph), facts, own);
	return found.sound ? (found.math ? 'math' : 'text') : null;
}

const VERBATIM_BEGIN = /\\begin\{([^{}\n]+)\}/g;
const COMMAND = /\\([A-Za-z]+)/g;
const verbatimCommands = new Set(verbatimCommandNames());

/** true where TeX reads every character as written: a verbatim body from the line after its \begin (the line itself
 * holds its options), or the text of a \verb whose closing delimiter is not typed yet. alltt reads commands, so it is out */
export function isLiteralAt(state: EditorState, pos: number): boolean {
	const from = Math.max(0, pos - WINDOW);
	const raw = state.sliceDoc(from, pos);
	// closed verbatim bodies and commands are blanked, so what is left open runs to the cursor
	const before = blankUnread(raw);
	const lineStart = before.lastIndexOf('\n') + 1;
	for (const m of before.matchAll(VERBATIM_BEGIN))
		if (commonEnvFacts(m[1]).body === 'verbatim' && m.index < lineStart && !before.includes(`\\end{${m[1]}}`, m.index)) return true;
	for (const m of before.slice(lineStart).matchAll(COMMAND)) {
		if (!verbatimCommands.has(m[1])) continue;
		const start = verbatimArgumentStart(before, lineStart + m.index + m[0].length, m[1]);
		if (start >= 0 && start < before.length && verbatimArgumentEnd(before, start, m[1]) < 0 && !NOT_DELIMITER.test(before[start]))
			return true;
	}
	return false;
}

/** the caret is in a comment: the line's last character before it reads as nothing once comments are blanked */
export function isCommentAt(state: EditorState, pos: number): boolean {
	const line = state.doc.lineAt(pos);
	const before = state.sliceDoc(line.from, pos);
	const last = before.trimEnd().length - 1;
	return last >= 0 && blankUnread(before)[last] === ' ';
}

const IN_MATH_BOOST = 12;
const OUT_OF_MATH_SINK = -6;

/** re-ranks math-flagged macro completions for the given context; composes with frecency boosts. */
export function withMathBoost(options: MacroCompletion[], inMath: boolean): MacroCompletion[] {
	const delta = inMath ? IN_MATH_BOOST : OUT_OF_MATH_SINK;
	return options.map((o) => (o.math ? { ...o, boost: (o.boost ?? 0) + delta } : o));
}

const TEXT_ONLY_SINK = -50;

/** outside math the math-only commands go; inside it the text-only ones rank last (they are legal there); an unknown mode keeps all */
export function withModeFilter(options: MacroCompletion[], mode: CompletionMode | null): MacroCompletion[] {
	if (mode === 'text') return options.filter((o) => !o.math);
	if (mode === 'math') return options.map((o) => (o.text ? { ...o, boost: (o.boost ?? 0) + TEXT_ONLY_SINK } : o));
	return options;
}
