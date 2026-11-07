// typst text and strings written from plain text: markup structure escaped, a string literal quoted

export function escLineStart(str: string): string {
	// `--` and `---` are the dash shorthands, which no list marker begins; after a line's leading
	// number typst reads `...` as dots, so the ellipsis goes out as itself
	return str
		.replace(/^(\s*)(-(?!-)|[+/=])/, '$1\\$2')
		.replace(/^(\s*)(\d+)\.\.\./, '$1$2\u2026')
		.replace(/^(\s*)(\d+)\./, '$1$2\\.');
}

const SHORTHAND_OF: Record<string, string> = { '\u2013': '--', '\u2014': '---', '\u2026': '...' };

function wordy(ch: string): boolean {
	return /[\p{L}\p{N}]/u.test(ch) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch);
}

/**
 * Backslash-escape Typst markup structure. `_` stays literal intraword (Typst emphasis only
 * opens at word boundaries, so snake_case is safe); `@` only starts a ref before a word char;
 * `//` would start a comment, so the first slash of a pair is escaped. `extra` lists characters
 * that are structure only in the caller's context (the colon of a term title).
 */
export function escTypst(str: string, startOfLine = false, extra = ''): string {
	let out = '';
	for (let i = 0; i < str.length; i++) {
		const ch = str[i];
		if ('\\#$`*[]<~'.includes(ch) || (extra && extra.includes(ch))) {
			out += '\\' + ch;
			continue;
		}
		if (ch === '_') {
			const intraword = i > 0 && i + 1 < str.length && wordy(str[i - 1]) && wordy(str[i + 1]);
			out += intraword ? ch : '\\_';
			continue;
		}
		// a dash or ellipsis character goes out as its shorthand below, which a ref would eat too
		if (ch === '@' && (/[\p{L}\p{N}\p{M}\p{Pc}-]/u.test(str[i + 1] ?? '') || SHORTHAND_OF[str[i + 1] ?? ''] !== undefined)) {
			out += '\\@';
			continue;
		}
		if (ch === '-' && (str[i + 1] === '?' || str[i + 1] === '-')) {
			out += '\\-';
			continue;
		}
		if (ch === '.' && str[i + 1] === '.' && str[i + 2] === '.') {
			out += '\\.';
			continue;
		}
		// the dash and ellipsis characters go out as the shorthand typst sources write them, so a
		// regenerated run reads as the file did; next to a hyphen or a dot the character itself
		// is kept, since the shorthand would fuse with its neighbour into another one
		const short = SHORTHAND_OF[ch];
		if (short) {
			const fuses = short[0] === '-' ? /[-?]/ : /[.]/;
			const prev = out[out.length - 1] ?? '';
			const next = str[i + 1] ?? '';
			out += fuses.test(prev) || fuses.test(next) ? ch : short;
			continue;
		}
		if (ch === '/' && str[i + 1] === '/') {
			out += '\\/';
			continue;
		}
		out += ch;
	}
	return startOfLine ? escLineStart(out) : out;
}

const STR_ESCAPES: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

export function typStr(value: string): string {
	let out = '"';
	for (const ch of value) {
		const code = ch.codePointAt(0)!;
		out += STR_ESCAPES[ch] ?? (code < 0x20 || code === 0x7f ? `\\u{${code.toString(16)}}` : ch);
	}
	return out + '"';
}
