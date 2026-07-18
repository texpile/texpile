// dvipdfmx/xdvipdfmx driver diagnostics; the patterns mirror the driver's own message emitters
// (dvipdfmx warning/fatal prefixes, config_special, the "No output PDF file written." epilogue).
// the driver writes to stdout, not the .log, so the input is the compile's captured terminal
// output; on a pdflatex/lualatex run nothing here matches and the result is empty.

import type { LogEntry } from './types';

const WARN = /^x?dvipdfmx:warning: (.+)$/;
const CONTINUED_WARN = /^x?dvipdfmx:warning: >> (.*)$/;
const FATAL = /^x?dvipdfmx:fatal: (.+)$/;
const ARGS_ERROR = /^x?dvipdfmx: ((?:Missing argument|Unexpected argument in) .+?|Multiple dvi filenames\?)/;
const CONFIG_ERROR = /^config_special: (Unknown option .+)/;
const ADDITIONAL = /^\s*(?:CMap name:|input str:|Font:|CMap:|Current input buffer is)/;
const KPATHSEA_MISSFONT = 'kpathsea: Appending font creation commands to missfont.log.';
const NO_OUTPUT_PDF = 'No output PDF file written.';

export function parseDviLog(text: string): LogEntry[] {
	const entries: LogEntry[] = [];
	let current: LogEntry | null = null;

	const flush = () => {
		if (current) entries.push(current);
		current = null;
	};
	const start = (level: LogEntry['level'], message: string, raw: string) => {
		flush();
		current = { level, message, source: 'dvi', raw };
	};
	const append = (text2: string, raw: string) => {
		if (!current) return;
		current.message += '\n' + text2;
		current.raw += '\n' + raw;
	};

	for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
		const cont = line.match(CONTINUED_WARN);
		if (cont) {
			if (current?.level === 'warning') append(cont[1].trim(), line);
			else start('warning', cont[1].trim(), line);
			continue;
		}
		if (ADDITIONAL.test(line)) {
			append(line.trim(), line);
			continue;
		}
		const warn = line.match(WARN);
		if (warn) {
			start('warning', warn[1].trim(), line);
			continue;
		}
		const fatal = line.match(FATAL) ?? line.match(ARGS_ERROR) ?? line.match(CONFIG_ERROR);
		if (fatal) {
			start('error', fatal[1].trim(), line);
			continue;
		}
		if (line.includes(KPATHSEA_MISSFONT)) {
			start('warning', KPATHSEA_MISSFONT, line);
			flush();
			continue;
		}
		if (line.includes(NO_OUTPUT_PDF)) {
			start('error', NO_OUTPUT_PDF, line);
			flush();
			continue;
		}
	}
	flush();
	return entries;
}
