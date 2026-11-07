// GitHub's math: `$...$` and `$$...$$` in a line, and `$$` over lines as a block. A `$` pair that does not fit stays text
import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';
import { containerDepth, linesAfter } from './blockLines';

const DOLLAR = 36;
const BACKSLASH = 92;

function escapedAt(text: string, at: number): boolean {
	let n = 0;
	while (at - n > 0 && text.charCodeAt(at - n - 1) === BACKSLASH) n++;
	return n % 2 === 1;
}

/** the end of the `$...$` or `$$...$$` that opens at `pos` in `text`, or -1 */
export function inlineMathEnd(text: string, pos: number): number {
	if (text.charCodeAt(pos) !== DOLLAR) return -1;
	const delimiter = text.charCodeAt(pos + 1) === DOLLAR ? '$$' : '$';
	const first = text.charAt(pos + delimiter.length);
	if (first === '' || first === ' ' || first === '\n') return -1;
	let end = pos + delimiter.length;
	for (;;) {
		end = text.indexOf(delimiter, end);
		if (end === -1) return -1;
		if (!escapedAt(text, end)) break;
		end++;
	}
	const content = text.slice(pos + delimiter.length, end);
	if (!content.trim() || /\s$/.test(content) || content.includes('\n\n')) return -1;
	return end + delimiter.length;
}

/** whether a `$$` block opens at `line`: a one-liner, or a closing `$$` before the next blank line */
function opensMathBlock(cx: BlockContext, line: Line): boolean {
	if (line.indent >= line.baseIndent + 4 || line.text.slice(line.pos, line.pos + 2) !== '$$') return false;
	const rest = line.text.slice(line.pos + 2).trim();
	if (rest.endsWith('$$') && rest.length > 2) return true;
	for (const next of linesAfter(cx, line)) {
		const text = next.replace(/^[ \t>]*/, '');
		if (text === '') return false;
		if (text.trimEnd().endsWith('$$')) return true;
	}
	return false;
}

export const mathSyntax: MarkdownConfig = {
	defineNodes: [{ name: 'InlineMath' }, { name: 'MathBlock', block: true }],
	parseInline: [
		{
			name: 'InlineMath',
			parse(cx, next, pos) {
				if (next !== DOLLAR) return -1;
				const end = inlineMathEnd(cx.text, pos - cx.offset);
				return end < 0 ? -1 : cx.addElement(cx.elt('InlineMath', pos, end + cx.offset));
			},
			before: 'Emphasis'
		}
	],
	parseBlock: [
		{
			name: 'MathBlock',
			parse(cx, line) {
				if (!opensMathBlock(cx, line)) return false;
				const from = cx.lineStart + line.pos;
				const rest = line.text.slice(line.pos + 2).trim();
				if (rest.endsWith('$$') && rest.length > 2) cx.nextLine();
				else {
					while (cx.nextLine() && containerDepth(line) >= cx.depth) {
						if (!line.text.slice(line.pos).trim().endsWith('$$')) continue;
						cx.nextLine();
						break;
					}
				}
				cx.addElement(cx.elt('MathBlock', from, cx.prevLineEnd()));
				return true;
			},
			endLeaf: (cx, line) => opensMathBlock(cx, line),
			before: 'FencedCode'
		}
	]
};
