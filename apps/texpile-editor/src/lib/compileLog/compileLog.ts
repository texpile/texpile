import { parseBibLog } from '$lib/languages/latex/log/blg-parser';
import { parseDviLog } from '$lib/languages/latex/log/dvi-parser';
import { parseLatexLog } from '$lib/languages/latex/log/parser';
import { enrichLogEntries } from '$lib/languages/latex/log/rules';
import { isTypstLog, parseTypstLog } from '$lib/languages/typst/logParser';
import type { CompileDiagnosticsOptions, LatexLogParseResult, LogEntry } from './types';

export { isTypstLog, parseTypstLog } from '$lib/languages/typst/logParser';

// A Typst run has no file tree and no TeX run status; only the entries are meaningful.
const EMPTY_LATEX_RESULT: LatexLogParseResult = {
	entries: [],
	errors: [],
	warnings: [],
	badboxes: [],
	files: [],
	status: { fatal: false, emergencyStop: false, noPages: false }
};

export { parseBibLog } from '$lib/languages/latex/log/blg-parser';
export type { BibLogParseResult } from '$lib/languages/latex/log/blg-parser';
export { parseDviLog } from '$lib/languages/latex/log/dvi-parser';
export { parseLatexLog } from '$lib/languages/latex/log/parser';
export { enrichLogEntries } from '$lib/languages/latex/log/rules';
export type { LatexLogParseResult, LogEntry, LogFileNode, LogLevel, LogRunStatus, ParseLatexLogOptions } from './types';

function withLevels(result: LatexLogParseResult, entries: LogEntry[]): LatexLogParseResult {
	return {
		...result,
		entries,
		errors: entries.filter((e) => e.level === 'error'),
		warnings: entries.filter((e) => e.level === 'warning'),
		badboxes: entries.filter((e) => e.level === 'badbox')
	};
}

/** parses and attaches rule ids/hints, dropping cascade restatements. */
export function parseAndEnrichLatexLog(text: string, options?: CompileDiagnosticsOptions): LatexLogParseResult {
	const result = parseLatexLog(text, options);
	return withLevels(result, enrichLogEntries(result.entries, options?.engine));
}

/** parses the engine log plus the optional bib log (.blg, bibtex or biber auto-detected) and the
 * compile's captured terminal output (dvipdfmx/xdvipdfmx driver diagnostics); extra entries are
 * appended after the engine's. */
export function parseCompileDiagnostics(
	logText: string,
	blgText?: string | null,
	stdoutText?: string | null,
	options?: CompileDiagnosticsOptions
): LatexLogParseResult {
	// Typst redirects its stderr into this same log. Sniffing the content rather than threading a
	// dialect flag through the worker keeps the message shape unchanged, and the two formats are
	// not confusable: no TeX engine prints codespan's box-drawing location marker. An EMPTY log
	// (a clean Typst run) falls through to the LaTeX parser, which correctly reports nothing.
	if (isTypstLog(logText)) {
		const entries = parseTypstLog(logText);
		return withLevels(EMPTY_LATEX_RESULT, entries);
	}
	const result = parseLatexLog(logText, options);
	const bib = blgText ? parseBibLog(blgText).entries : [];
	const dvi = stdoutText ? parseDviLog(stdoutText) : [];
	return withLevels(result, enrichLogEntries([...result.entries, ...bib, ...dvi], options?.engine));
}
