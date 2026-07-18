// regex line lexer + a pushdown stack tracking which file the engine has open (the log's "(file" / ")" markers)

import { LogScanner } from './scanner';
import type { LatexLogParseResult, LogEntry, LogFileNode, LogRunStatus, ParseLatexLogOptions } from './types';

// -file-line-error mode replaces "! " with "<file>:<line>: ". TeX Live prints resolved paths
// ("./main.tex", "/abs/x.tex", "c:/..."); MikTeX can print a bare "file.tex:12:", so a second
// form accepts an extensioned bare name (the extension requirement keeps prose "note: 1: ..."
// out).
const FILE_LINE_ERROR = /^((?:[A-Za-z]:\/|\/|\.{1,2}\/)[^:]*|[^:\s()\\{}]+\.[\w-]+):(\d+): (.*)$/;

// warning prefix vocabulary is open (l3msg module types), so match the shape, not a fixed list
const KERNEL_WARNING = /^(LaTeX(?:3| Font)?) (Warning|Info): (.*)$/;
const MODULE_WARNING = /^(Package|Class|Module) ([\w@.-]+) (Warning|Info): (.*)$/;

const BADBOX = /^(Overfull|Underfull|Loose|Tight) \\([hv])box \(((?:badness \d+)|(?:[\d.]+pt too (?:wide|high|deep)))\)(.*)$/;

const ON_INPUT_LINE = / on input line (\d+)\.?\s*$/;
const AT_LINES = / at lines (\d+)--(\d+)/;
const AT_LINE = / (?:detected )?at line (\d+)/;

// engine error context: "l.<n> <text>"
const CONTEXT_LINE = /^l\.(\d+)( .*|$)/;

// "Runaway argument?" preludes a following "! ..." error
const RUNAWAY = /^Runaway (argument|definition|text|preamble)\?/;

const MISSING_CHARACTER = /^\s*Missing character: There is no .* in font/;

const PDFTEX_WARNING = /^pdfTeX warning(?: \([^)]*\))?: ?(.*)$/;

// boxes reported during page shipout carry a PDF page, never a source line
const OUTPUT_ACTIVE = / has occurred while \\output is active(?: \[(\d+)\])?/;

const OUTPUT_WRITTEN = /^Output written on (.*) \((\d+) pages?, \d+ bytes\)\.?$/;

// \MessageBreak continuations: "(<name>)" + spaces for Package/Class, deep indent for kernel warnings
function isWarningContinuation(line: string, moduleName?: string): boolean {
	if (moduleName && line.startsWith(`(${moduleName})`)) return true;
	return /^ {3,}\S/.test(line);
}

/**
 * Reads a file path right after a "(", or null when the paren is plain text.
 * kpathsea prints resolved names, so a real marker starts "./", "../", "/" or "c:/"
 * (bare "dir/..." also occurs when builds pass relative paths). Spaces are legal in
 * names, so a space only ends the path after an extension or before markup.
 */
export function consumeFilePath(rest: string): { path: string; consumed: number } | null {
	// MikTeX opens files by bare name ("(foo.sty"); requiring a real lowercase extension of 3+
	// letters keeps prose parens ("(see x.y)") from polluting the stack
	if (!/^(?:[A-Za-z]:\/|\/|\.{1,2}\/)/.test(rest) && !/^[^\s()\\{}]+\//.test(rest)) {
		const bare = rest.match(/^"?([^"\s()\\{}[\]]+\.[a-z]{3,})(?=[\s()"]|$)/);
		if (!bare) return null;
		return { path: bare[1], consumed: bare[0].length };
	}
	let end = rest.search(/[ ()\\{}]/);
	while (end !== -1 && rest[end] === ' ') {
		const sofar = rest.slice(0, end);
		if (/\.[\w-]+$/.test(sofar)) break; // "....tex ": extension ends the path
		const after = rest.slice(end + 1);
		if (/^[\s"()[\]<{]/.test(after)) break; // next token is markup, not more name
		const more = after.search(/[ ()\\{}"[\]<]/);
		end = more === -1 ? -1 : end + 1 + more;
	}
	const path = end === -1 ? rest : rest.slice(0, end);
	if (path.length === 0) return null;
	return { path, consumed: path.length };
}

const DEFAULTS: Required<ParseLatexLogOptions> = {
	dedupe: true,
	includeInfo: false,
	maxPrintLine: 79,
	maxEntries: 500
};

export function parseLatexLog(text: string, options: ParseLatexLogOptions = {}): LatexLogParseResult {
	const opts = { ...DEFAULTS, ...options };
	const scanner = new LogScanner(text, opts.maxPrintLine);

	const entries: LogEntry[] = [];
	const status: LogRunStatus = { fatal: false, emergencyStop: false, noPages: false };

	// file-scope pushdown stack; root is synthetic so the main file's own "(" lands in the tree
	const root: LogFileNode = { path: '', children: [] };
	const fileStack: LogFileNode[] = [root];
	let plainParens = 0; // unmatched non-file "(" seen inside the current file scope

	const currentFile = (): string | undefined => {
		const top = fileStack[fileStack.length - 1];
		return top === root ? undefined : top.path;
	};

	const push = (entry: LogEntry) => {
		if (entries.length < opts.maxEntries) entries.push(entry);
	};

	/** consume an engine error block: help/context lines up to the l.NN pair or a blank line. */
	function collectErrorBlock(entry: LogEntry): void {
		const contextLines: string[] = [];
		let sawContext = false;
		for (let guard = 0; guard < 60; guard++) {
			const line = scanner.next();
			if (line === null) break;
			if (line.startsWith('!') || FILE_LINE_ERROR.test(line) || RUNAWAY.test(line)) {
				scanner.rewind(); // next diagnostic begins; errors need not be blank-separated
				break;
			}
			const ctx = line.match(CONTEXT_LINE);
			if (ctx) {
				entry.line = entry.line ?? parseInt(ctx[1], 10);
				// the l.NN line prints the source up to the error point: its length is the column,
				// and its tail re-anchors the range if the buffer drifted since the compile
				const preText = ctx[2].startsWith(' ') ? ctx[2].slice(1) : ctx[2];
				if (preText.length > 0 && entry.column === undefined) {
					entry.column = preText.length + 1;
					const anchor = preText.slice(-24).trimStart();
					if (anchor.length >= 2) entry.anchorText = anchor;
				}
				sawContext = true;
				contextLines.push(line);
				// the engine prints one more line: the text after the error point
				const after = scanner.next();
				if (after !== null) {
					if (after.trim().length > 0) contextLines.push(after);
					else scanner.rewind();
				}
				continue;
			}
			if (line.trim().length === 0) {
				if (sawContext) break; // blank after the l.NN pair ends the block
				if (contextLines.length > 0 && contextLines[contextLines.length - 1].trim() === '') break; // two blanks with no context in sight: give up
				contextLines.push('');
				continue;
			}
			contextLines.push(line);
		}
		const context = contextLines.join('\n').replace(/\n+$/, '');
		if (context.length > 0) entry.context = context;
		entry.raw = [entry.raw, context].filter(Boolean).join('\n');
	}

	/** consume \MessageBreak continuation lines and fold them into one message. */
	function collectWarningContinuation(entry: LogEntry, moduleName?: string): void {
		const parts: string[] = [];
		for (let guard = 0; guard < 20; guard++) {
			const line = scanner.next();
			if (line === null) break;
			if (!isWarningContinuation(line, moduleName)) {
				scanner.rewind();
				break;
			}
			let text = line;
			if (moduleName && text.startsWith(`(${moduleName})`)) text = text.slice(moduleName.length + 2);
			parts.push(text.trim());
			entry.raw += '\n' + line;
		}
		if (parts.length > 0) {
			entry.message = [entry.message, ...parts].join(' ').replace(/\s+/g, ' ').trim();
		}
		const online = entry.message.match(ON_INPUT_LINE);
		if (online) {
			entry.line = parseInt(online[1], 10);
			// the row already shows ":<line>", so drop the redundant phrase from the text
			entry.message = entry.message.replace(ON_INPUT_LINE, '.').replace(/([.!?])\.$/, '$1');
		}
	}

	/** walk a line's parentheses, maintaining the file stack. */
	function scanParens(line: string): void {
		let rest = line;
		for (;;) {
			const pos = rest.search(/[()]/);
			if (pos === -1) return;
			const token = rest[pos];
			rest = rest.slice(pos + 1);
			if (token === '(') {
				const consumed = consumeFilePath(rest);
				if (consumed) {
					const node: LogFileNode = { path: consumed.path, children: [] };
					fileStack[fileStack.length - 1].children.push(node);
					fileStack.push(node);
					rest = rest.slice(consumed.consumed);
				} else {
					plainParens++;
				}
			} else {
				if (plainParens > 0) plainParens--;
				else if (fileStack.length > 1) fileStack.pop();
			}
		}
	}

	let first: string | null = null;
	for (;;) {
		const line = scanner.next();
		if (line === null) break;
		if (first === null) {
			first = line;
			if (/^This is /.test(line)) {
				status.engine = line
					.replace(/^This is /, '')
					.split('(')[0]
					.trim();
				continue;
			}
		}

		if (line.startsWith('!  ==> Fatal error occurred')) {
			status.fatal = true;
			continue;
		}
		const out = line.match(OUTPUT_WRITTEN);
		if (out) {
			status.outputWritten = out[1];
			status.pages = parseInt(out[2], 10);
			continue;
		}
		if (line.startsWith('No pages of output')) {
			status.noPages = true;
			// surfaced as an error: a zero-page run with no other complaint would otherwise
			// read as "Compiled clean" in the Problems panel
			push({ level: 'error', message: 'No pages of output.', file: currentFile(), raw: line });
			continue;
		}

		if (line.startsWith('! ')) {
			const message = line.slice(2);
			if (message.includes('ignored error')) continue; // engine note, not a real diagnostic
			if (/^Emergency stop\./.test(message)) status.emergencyStop = true;
			const entry: LogEntry = {
				level: 'error',
				message,
				file: currentFile(),
				raw: line
			};
			collectErrorBlock(entry);
			push(entry);
			continue;
		}
		const fle = line.match(FILE_LINE_ERROR);
		if (fle) {
			const entry: LogEntry = {
				level: 'error',
				message: fle[3],
				file: fle[1],
				line: parseInt(fle[2], 10),
				raw: line
			};
			collectErrorBlock(entry);
			push(entry);
			continue;
		}
		if (RUNAWAY.test(line)) {
			// own entry with the token dump as context; the following "!" line parses normally
			const entry: LogEntry = {
				level: 'error',
				message: line,
				file: currentFile(),
				raw: line
			};
			const dump = scanner.next();
			if (dump !== null) {
				if (dump.trim().length > 0 && !dump.startsWith('!')) {
					entry.context = dump;
					entry.raw += '\n' + dump;
				} else scanner.rewind();
			}
			push(entry);
			continue;
		}

		const kern = line.match(KERNEL_WARNING);
		if (kern) {
			const level = kern[2] === 'Warning' ? 'warning' : 'info';
			if (level === 'info' && !opts.includeInfo) {
				// still consume continuations so their parens don't hit the stack
				const e: LogEntry = { level, message: kern[3], raw: line };
				collectWarningContinuation(e);
				continue;
			}
			const entry: LogEntry = {
				level,
				message: `${kern[1]} ${kern[2]}: ${kern[3]}`,
				file: currentFile(),
				raw: line
			};
			collectWarningContinuation(entry);
			if (/Empty `thebibliography' environment/.test(entry.message)) continue; // noise, not actionable
			push(entry);
			continue;
		}
		const mod = line.match(MODULE_WARNING);
		if (mod) {
			const level = mod[3] === 'Warning' ? 'warning' : 'info';
			if (level === 'info' && !opts.includeInfo) {
				const e: LogEntry = { level, message: mod[4], raw: line };
				collectWarningContinuation(e, mod[2]);
				continue;
			}
			const entry: LogEntry = {
				level,
				message: `${mod[1]} ${mod[2]} ${mod[3]}: ${mod[4]}`,
				file: currentFile(),
				raw: line
			};
			collectWarningContinuation(entry, mod[2]);
			push(entry);
			continue;
		}

		const box = line.match(BADBOX);
		if (box) {
			const entry: LogEntry = {
				level: 'badbox',
				message: line,
				file: currentFile(),
				raw: line
			};
			const range = line.match(AT_LINES);
			const single = line.match(AT_LINE);
			if (range) {
				entry.line = parseInt(range[1], 10);
				entry.lineEnd = parseInt(range[2], 10);
			} else if (single) {
				entry.line = parseInt(single[1], 10);
			} else {
				const active = line.match(OUTPUT_ACTIVE);
				if (active?.[1]) entry.page = parseInt(active[1], 10);
			}
			push(entry);
			// hbox complaints are followed by a box dump ending in "[]" + blank;
			// consume it so its stray parens/brackets never reach the file stack.
			if (box[2] === 'h') {
				for (let guard = 0; guard < 30; guard++) {
					const dump = scanner.next();
					if (dump === null) break;
					if (dump.trim().length === 0) break;
					if (dump.startsWith('!') || BADBOX.test(dump)) {
						scanner.rewind();
						break;
					}
					entry.raw += '\n' + dump;
					if (dump.trim() === '[]') break;
				}
			}
			continue;
		}

		if (MISSING_CHARACTER.test(line)) {
			push({ level: 'warning', message: line.trim(), file: currentFile(), raw: line });
			continue;
		}

		// pdfTeX driver warnings (broken \hyperref destinations etc.)
		if (PDFTEX_WARNING.test(line)) {
			push({ level: 'warning', message: line.trim(), file: currentFile(), raw: line });
			continue;
		}

		// everything else only matters for file-scope tracking
		scanParens(line);
	}

	let final = entries;
	if (opts.dedupe) {
		const seen = new Set<string>();
		final = entries.filter((e) => {
			const key = `${e.level} ${e.message} ${e.file ?? ''} ${e.line ?? ''}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	return {
		entries: final,
		errors: final.filter((e) => e.level === 'error'),
		warnings: final.filter((e) => e.level === 'warning'),
		badboxes: final.filter((e) => e.level === 'badbox'),
		files: root.children,
		status
	};
}
