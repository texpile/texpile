export type LogLevel = 'error' | 'warning' | 'badbox' | 'info';

export interface LogEntry {
	level: LogLevel;
	/** First line of the message, prefix kept as printed (e.g. "LaTeX Error: File `x' not found."). */
	message: string;
	/** Source file as printed by TeX (usually relative to the compile cwd, e.g. "./sections/intro.tex"). */
	file?: string;
	/** 1-based source line, when the log names one. */
	line?: number;
	/** End of a range ("at lines 88--90"). */
	lineEnd?: number;
	/** 1-based column of the error point, from the length of the `l.NN` context prefix. */
	column?: number;
	/** source text just before the error point (context tail) or the offending key; anchors the
	 * editor range even when the buffer drifted from the compiled file. */
	anchorText?: string;
	/** PDF page, for boxes reported "while \output is active [N]" (no source line exists). */
	page?: number;
	/** For errors: the raw block that followed (help text, `l.NN` context). Useful for detail display. */
	context?: string;
	/** Raw log slice this entry was built from (message line + consumed continuation). */
	raw: string;
	/** Stable rule id attached by enrichLogEntries (rules.ts). */
	ruleId?: string;
	/** Human-readable hint (our own wording). */
	hint?: string;
	/** Package we believe is missing, when the error suggests one (e.g. amsmath for \align). */
	suggestedPackage?: string;
	/** The offending command extracted from error context (e.g. "\alpah"), for precise highlighting. */
	command?: string;
	/** Which tool produced the entry: undefined = the LaTeX engine, 'bib' = bibtex/biber (.blg),
	 * 'dvi' = the dvipdfmx/xdvipdfmx driver (captured from the compile's terminal output). */
	source?: 'bib' | 'dvi';
}

/** Nested file-open tree reconstructed from the log's `(file ... )` markers. */
export interface LogFileNode {
	path: string;
	children: LogFileNode[];
}

export interface LogRunStatus {
	/** `!  ==> Fatal error occurred, no output PDF file produced!` seen. */
	fatal: boolean;
	/** `! Emergency stop.` seen. */
	emergencyStop: boolean;
	/** From `Output written on <file> (<n> pages, <m> bytes).` */
	pages?: number;
	outputWritten?: string;
	/** `No pages of output.` seen. */
	noPages: boolean;
	/** First line of the log (engine banner), e.g. "This is pdfTeX, Version ...". */
	engine?: string;
}

export interface LatexLogParseResult {
	/** All entries in log order. */
	entries: LogEntry[];
	errors: LogEntry[];
	warnings: LogEntry[];
	badboxes: LogEntry[];
	files: LogFileNode[];
	status: LogRunStatus;
}

export interface ParseLatexLogOptions {
	/** Collapse identical (level, message, file, line) repeats (reruns/passes). Default true. */
	dedupe?: boolean;
	/** Also collect `LaTeX Font Info:` / `Package X Info:` lines. Default false. */
	includeInfo?: boolean;
	/** Wrap column the engine used (texmf.cnf max_print_line). Default 79. */
	maxPrintLine?: number;
	/** Hard cap on entries, guards against pathological logs. Default 500. */
	maxEntries?: number;
}
