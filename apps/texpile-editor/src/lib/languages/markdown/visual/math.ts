/* eslint no-param-reassign: "off" -- markdown-it rules advance parsing by mutating state.pos/state.line; that is the API */
// $-math rules for markdown-it, deliberately small: `$...$` inline on one line, `$$...$$`
// blocks. Anything the rules don't match stays literal text, which the verbatim layer round-trips
// untouched, so a false negative costs display fidelity, never bytes.
import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

function escaped(src: string, at: number): boolean {
	let n = 0;
	while (at - n > 0 && src.charCodeAt(at - n - 1) === BACKSLASH) n++;
	return n % 2 === 1;
}

function mathInline(state: StateInline, silent: boolean): boolean {
	const src = state.src;
	const pos = state.pos;
	if (src.charCodeAt(pos) !== DOLLAR) return false;
	if (src.charCodeAt(pos + 1) === DOLLAR) return false; // $$ belongs to the block rule
	if (escaped(src, pos)) return false;
	const first = src.charCodeAt(pos + 1);
	if (Number.isNaN(first) || first === 0x20 || first === 0x0a) return false; // "$ x$" stays a dollar sign

	let end = pos + 1;
	for (;;) {
		end = src.indexOf('$', end);
		if (end === -1) return false;
		if (!escaped(src, end)) break;
		end++;
	}
	const content = src.slice(pos + 1, end);
	// closing $ can't follow whitespace, and math never spans a blank line
	if (!content.trim() || /\s$/.test(content) || content.includes('\n\n')) return false;

	if (!silent) {
		const token = state.push('math_inline', 'math', 0);
		token.markup = '$';
		token.content = content;
	}
	state.pos = end + 1;
	return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (pos + 2 > max || state.src.slice(pos, pos + 2) !== '$$') return false;

	pos += 2;
	let firstLine = state.src.slice(pos, max);
	let lastLine = '';
	let found = false;
	let nextLine = startLine;

	const trimmedFirst = firstLine.trim();
	if (trimmedFirst.endsWith('$$') && trimmedFirst.length > 2) {
		// one-liner: $$ e = mc^2 $$
		firstLine = trimmedFirst.slice(0, -2);
		found = true;
	}
	while (!found) {
		nextLine++;
		if (nextLine >= endLine) return false; // unclosed: let the paragraph rule keep it literal
		if (state.isEmpty(nextLine)) return false; // a blank line ends display math in TeX as well
		pos = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];
		if (pos < max && state.tShift[nextLine] < state.blkIndent) return false;
		const line = state.src.slice(pos, max).trim();
		if (line.endsWith('$$')) {
			lastLine = line.slice(0, -2);
			found = true;
		}
	}
	if (silent) return true;

	state.line = nextLine + 1;
	const token = state.push('math_block', 'math', 0);
	token.block = true;
	token.content =
		(firstLine.trim() ? firstLine.trim() + '\n' : '') +
		(nextLine > startLine ? state.getLines(startLine + 1, nextLine, state.tShift[startLine], true) : '') +
		(lastLine.trim() ? lastLine.trim() : '');
	token.map = [startLine, state.line];
	token.markup = '$$';
	return true;
}

export function mathPlugin(md: MarkdownIt): void {
	md.inline.ruler.after('escape', 'math_inline', mathInline);
	md.block.ruler.after('blockquote', 'math_block', mathBlock, {
		alt: ['paragraph', 'reference', 'blockquote', 'list']
	});
}
