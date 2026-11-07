// reading TeX source by hand, a token at a time, where the parse table has no signature to read it by

export type SourceToken = { name: string; from: number; to: number };

const COMMAND = /\\(?:[a-zA-Z@]+|[^a-zA-Z@])/y;
const SPACE = /[ \t]*(?:\r?\n[ \t]*)?/y;

/** the control word or symbol at `at` */
export function commandAt(src: string, at: number): SourceToken | null {
	COMMAND.lastIndex = at;
	const m = COMMAND.exec(src);
	return m ? { name: m[0].slice(1), from: at, to: at + m[0].length } : null;
}

/** past the spaces and the one line break TeX skips between tokens */
export function skipSpace(src: string, at: number): number {
	SPACE.lastIndex = at;
	SPACE.exec(src);
	return SPACE.lastIndex;
}

/** past the `}` that closes the brace at `open`, comments and escaped braces skipped; -1 when it never closes */
export function groupEnd(src: string, open: number): number {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const c = src[i];
		if (c === '\\') i++;
		else if (c === '%') {
			const eol = src.indexOf('\n', i);
			if (eol < 0) return -1;
			i = eol;
		} else if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return i + 1;
	}
	return -1;
}

/** the text as one line: comments dropped, spaces collapsed */
export function oneLine(text: string): string {
	return text
		.replace(/(^|[^\\])%[^\n]*/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}
