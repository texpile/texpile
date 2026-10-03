// the written form of inline markdown: prose escaping, code spans, link targets and images,
// each chosen so markdown-it reads back exactly the value it was given

const ENTITY = /&(?=[a-zA-Z][a-zA-Z0-9]{0,31};|#\d{1,7};|#[xX][0-9a-fA-F]{1,6};)/g;
const ASCII_PUNCT_AHEAD = /\\(?=[!-/:-@[-`{-~])/g;

export function escLineStart(line: string): string {
	return line
		.replace(/^[#\-+>]/, '\\$&')
		.replace(/^(\d+)([.)])/, '$1\\$2')
		.replace(/^(=+)(\s*)$/, '\\$1$2');
}

/** backslash-escape markdown structure chars; `_` stays literal intraword (prosemirror-markdown's
 * rule: an underscore between word chars can't open emphasis). */
export function escMd(str: string, startOfLine = false, inTableCell = false): string {
	const escaped = str
		.replace(/[`*\\~[\]_<$]/g, (m, i: number) => {
			if (m === '_' && i > 0 && i + 1 < str.length && /\w/.test(str[i - 1]) && /\w/.test(str[i + 1])) return m;
			return '\\' + m;
		})
		.replace(ENTITY, '\\&');
	if (inTableCell) return escaped.replace(/\n/g, ' ').replace(/\|/g, '\\|');
	// a newline inside a text node starts a source line too. leading indentation goes: the
	// parser drops it anyway, and four spaces would open a code block
	return escaped
		.split('\n')
		.map((line, i) => (i === 0 && !startOfLine ? line : escLineStart(line.replace(/^[ \t]+/, ''))))
		.join('\n');
}

/** inline code with a backtick fence longer than any run inside, padded when the ends collide
 *  or when the parser would otherwise strip the span's own edge spaces (CommonMark strips one
 *  from each end of a span that starts and ends with a space, unless it is nothing but spaces) */
export function codeSpan(text: string, inTableCell = false): string {
	const runs = text.match(/`+/g);
	const fence = '`'.repeat(runs ? Math.max(...runs.map((r) => r.length)) + 1 : 1);
	const spaced = text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text);
	const pad = text.startsWith('`') || text.endsWith('`') || spaced ? ' ' : '';
	const body = inTableCell ? text.replace(/\n/g, ' ').replace(/\|/g, '\\|') : text;
	return fence + pad + body + pad + fence;
}

/** control characters percent-encoded: a newline can appear nowhere in a destination */
function encodeControl(href: string): string {
	let out = '';
	for (const c of href) {
		const code = c.charCodeAt(0);
		out += code < 32 || code === 127 ? `%${code.toString(16).toUpperCase().padStart(2, '0')}` : c;
	}
	return out;
}

/** `<href>` when the destination holds a space, parens or angle brackets */
export function formatLinkDest(href: string, inTableCell = false): string {
	let s = encodeControl(href).replace(ASCII_PUNCT_AHEAD, '\\\\');
	if (inTableCell) s = s.replace(/\|/g, '\\|');
	return /[\s()<>]/.test(s) ? `<${s.replace(/[<>]/g, '\\$&')}>` : s;
}

export function formatLinkTitle(title: string | null | undefined, inTableCell = false): string {
	if (!title) return '';
	let s = title.replace(/[\\"]/g, '\\$&').replace(/\n/g, ' ');
	if (inTableCell) s = s.replace(/\|/g, '\\|');
	return ` "${s}"`;
}

/** `![alt](src "title")`: the reader inline-parses the alt, so it takes prose escaping */
export function formatImage(alt: string, src: string, title: string, inTableCell = false): string {
	return `![${escMd(alt, false, inTableCell)}](${formatLinkDest(src, inTableCell)}${formatLinkTitle(title, inTableCell)})`;
}
