import type { SyntaxNode } from '@lezer/common';
import { bytesSpan, standsFor, type BlockSpan, type LeafSpan } from '$lib/editor/visual/sourceSpans';
import { trimmedEnd, type LinePrefix, type Reader } from './reader';

const EMPTY_LINE = /^[ \t>]*$/;

export function contentEnd(r: Reader, node: SyntaxNode): number {
	const text = r.src.text;
	// a fence left open at the end of the file holds the blank lines before the end as code
	if (node.name === 'FencedCode' && node.to === text.length && node.getChildren('CodeMark').length < 2)
		return text.endsWith('\n') ? text.length - 1 : text.length;
	let end = r.src.lineEnd(Math.max(node.from, node.to - 1));
	for (;;) {
		const start = r.src.lineStart(end);
		if (start <= node.from || !EMPTY_LINE.test(text.slice(start, end))) return end;
		end = start - 1;
	}
}

export function topLevelSpan(r: Reader, node: SyntaxNode): { srcFrom: number; srcTo: number } | null {
	const from = r.src.at(r.src.lineStart(node.from));
	const to = r.src.at(contentEnd(r, node));
	return from < to ? { srcFrom: from, srcTo: to } : null;
}

export function blockStands(r: Reader, node: SyntaxNode): LeafSpan[] | null {
	const span = topLevelSpan(r, node);
	return span ? standsFor(1, span.srcFrom, span.srcTo) : null;
}

export function nestedSpan(r: Reader, node: SyntaxNode): BlockSpan | null {
	// indented code takes its four columns with it, so a fence written for it sits where the container's lines do
	const indent = node.name === 'CodeBlock' && r.src.text.slice(node.from - 4, node.from) === '    ' ? 4 : 0;
	const from = r.src.at(node.from - indent);
	const to = r.src.at(node.name === 'Paragraph' || node.name === 'Task' ? trimmedEnd(r, node.from, node.to) : contentEnd(r, node));
	return to > from ? { srcFrom: from, srcTo: to, size: 1 } : null;
}

export function stripPrefix(line: string, prefixes: readonly LinePrefix[]): { length: number; pad: number } {
	let at = 0;
	let column = 0;
	for (const prefix of prefixes) {
		if (prefix.quote) {
			let i = at;
			while (i < line.length && line[i] === ' ' && i - at < 3) i++;
			if (line[i] !== '>') return { length: at, pad: 0 };
			column += i + 1 - at;
			at = i + 1;
			if (line[at] === ' ') {
				at++;
				column++;
			}
			continue;
		}
		const goal = column + prefix.width;
		while (at < line.length && column < goal && (line[at] === ' ' || line[at] === '\t')) {
			column += line[at] === '\t' ? 4 - (column % 4) : 1;
			at++;
		}
		if (column > goal) return { length: at, pad: column - goal };
	}
	return { length: at, pad: 0 };
}

export type SourceChars = { text: string; offsets: number[] };

function joinChars(parts: SourceChars[], between: (prev: number) => number | null): SourceChars {
	let text = '';
	const offsets: number[] = [];
	parts.forEach((part, i) => {
		if (i > 0) {
			const nl = between(i);
			if (nl !== null) {
				text += '\n';
				offsets.push(nl);
			}
		}
		text += part.text;
		offsets.push(...part.offsets);
	});
	return { text, offsets };
}

function charsOfRange(r: Reader, from: number, to: number): SourceChars {
	const offsets: number[] = [];
	for (let i = from; i < to; i++) offsets.push(i);
	return { text: r.src.text.slice(from, to), offsets };
}

export function charsOfRanges(r: Reader, ranges: { from: number; to: number }[]): SourceChars {
	return joinChars(
		ranges.map((range) => charsOfRange(r, range.from, range.to)),
		() => null
	);
}

export function charsOfLines(r: Reader, first: number, last: number): SourceChars {
	const lines: SourceChars[] = [];
	const lineEnds: number[] = [];
	let lineFrom = r.src.lineStart(first);
	while (lineFrom <= last) {
		const lineTo = r.src.lineEnd(lineFrom);
		const before = lines.length === 0 ? r.src.text.slice(lineFrom, first) : r.src.text.slice(lineFrom, lineTo);
		// the first line of a block that follows a list's marker has no prefix to take off
		const strip = lines.length > 0 || /^[ \t>]*$/.test(before) ? stripPrefix(before, r.prefixes) : { length: first - lineFrom, pad: 0 };
		const to = Math.min(lineTo, last);
		const chars = charsOfRange(r, Math.min(lineFrom + strip.length, to), to);
		if (strip.pad > 0) {
			chars.text = ' '.repeat(strip.pad) + chars.text;
			chars.offsets.unshift(...Array<number>(strip.pad).fill(lineFrom + strip.length - 1));
		}
		lines.push(chars);
		lineEnds.push(to);
		lineFrom = lineTo + 1;
	}
	return joinChars(lines, (i) => lineEnds[i - 1]);
}

export function dedent(chars: SourceChars, max: number): SourceChars {
	if (max <= 0) return chars;
	let text = '';
	const offsets: number[] = [];
	let lineStart = true;
	let stripped = 0;
	for (let i = 0; i < chars.text.length; i++) {
		const ch = chars.text[i];
		if (lineStart && ch === ' ' && stripped < max) {
			stripped++;
			continue;
		}
		lineStart = ch === '\n';
		stripped = 0;
		text += ch;
		offsets.push(chars.offsets[i]);
	}
	return { text, offsets };
}

export function withoutFinalBreak(chars: SourceChars): SourceChars {
	return chars.text.endsWith('\n') ? { text: chars.text.slice(0, -1), offsets: chars.offsets.slice(0, -1) } : chars;
}

export function spansOfChars(r: Reader, chars: SourceChars): LeafSpan[] {
	const out: LeafSpan[] = [];
	const { text, offsets } = chars;
	let i = 0;
	while (i < text.length) {
		if (text[i] === '\n') {
			const next = i + 1 < offsets.length ? offsets[i + 1] : offsets[i] + 1;
			out.push({ from: i, to: i + 1, srcFrom: r.src.at(offsets[i]), srcTo: r.src.at(Math.max(next, offsets[i] + 1)), kind: 'sub' });
			i++;
			continue;
		}
		let j = i + 1;
		if (text[i] === ' ' && r.src.text[offsets[i]] === '\t') {
			while (j < text.length && offsets[j] === offsets[i]) j++;
			out.push({ from: i, to: j, srcFrom: r.src.at(offsets[i]), srcTo: r.src.at(offsets[i]) + 1, kind: 'sub' });
			i = j;
			continue;
		}
		while (j < text.length && text[j] !== '\n' && offsets[j] === offsets[j - 1] + 1 && r.src.text[offsets[j]] === text[j]) j++;
		out.push({ from: i, to: j, srcFrom: r.src.at(offsets[i]), srcTo: r.src.at(offsets[i]) + (j - i), kind: 'text' });
		i = j;
	}
	return out;
}

export function stands(r: Reader, node: SyntaxNode, len: number): LeafSpan[] {
	return standsFor(len, r.src.at(node.from), r.src.at(node.to));
}

export function bytes(r: Reader, from: number, text: string): LeafSpan[] {
	return bytesSpan(text.length, r.src.at(from));
}

export function linesOf(r: Reader, node: SyntaxNode): SourceChars {
	return charsOfLines(r, r.prefixes.length === 0 ? r.src.lineStart(node.from) : node.from, contentEnd(r, node));
}
