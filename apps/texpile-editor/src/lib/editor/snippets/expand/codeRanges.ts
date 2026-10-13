// where LaTeX and Markdown source holds code: verbatim environments, \verb, fences, code spans, link destinations
export type CodeRange = { from: number; to: number };

const LATEX_CODE =
	/\\[\\%]|%[^\n]*|\\begin[ \t]*\{(verbatim\*?|lstlisting|minted|comment|filecontents\*?)\}|\\(verb\*?|lstinline|mintinline)(?![A-Za-z])/g;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const INDENTED_CODE = /^(?: {4}| {0,3}\t)/;
const LIST_ITEM = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;
const AUTOLINK = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/g;
const ANGLE_DESTINATION = /<[^<>\n]*>/y;

type InlineVerbatim = 'verb' | 'lstinline' | 'mintinline';

// unclosed: one past the end, so the end itself is inside
function lineEndAfter(text: string, at: number): number {
	const end = text.indexOf('\n', at);
	return (end < 0 ? text.length : end) + 1;
}

/** \verb|x|, \lstinline[opts]{x} and \mintinline[opts]{lang}|x|, closed within the line */
function inlineVerbatimEnd(text: string, at: number, command: InlineVerbatim): number {
	const unclosed = lineEndAfter(text, at);
	let i = at;
	if (command !== 'verb' && text[i] === '[') i = text.indexOf(']', i) + 1 || unclosed;
	if (command === 'mintinline') i = text[i] === '{' ? text.indexOf('}', i) + 1 || unclosed : unclosed;
	if (i >= unclosed - 1) return unclosed;
	const closer = command !== 'verb' && text[i] === '{' ? '}' : text[i];
	const end = text.indexOf(closer, i + 1);
	return end >= 0 && end < unclosed ? end + 1 : unclosed;
}

export function latexCodeRanges(text: string): CodeRange[] {
	const ranges: CodeRange[] = [];
	LATEX_CODE.lastIndex = 0;
	for (let m = LATEX_CODE.exec(text); m; m = LATEX_CODE.exec(text)) {
		let to: number;
		if (m[1]) {
			const close = text.indexOf(`\\end{${m[1]}}`, LATEX_CODE.lastIndex);
			to = close < 0 ? text.length + 1 : close + m[1].length + 6;
		} else if (m[2]) to = inlineVerbatimEnd(text, LATEX_CODE.lastIndex, m[2].replace(/\*$/, '') as InlineVerbatim);
		else continue;
		ranges.push({ from: m.index, to });
		LATEX_CODE.lastIndex = to;
	}
	return ranges;
}

function codeSpans(text: string, from: number, to: number): CodeRange[] {
	const spans: CodeRange[] = [];
	const runs = [...text.slice(from, to).matchAll(/`+/g)].map((m) => ({ at: from + m.index, length: m[0].length }));
	for (let i = 0; i < runs.length; i++) {
		if (text[runs[i].at - 1] === '\\') continue;
		const close = runs.findIndex((run, j) => j > i && run.length === runs[i].length);
		if (close < 0) continue;
		spans.push({ from: runs[i].at, to: runs[close].at + runs[close].length });
		i = close;
	}
	return spans;
}

function autolinks(text: string, from: number, to: number): CodeRange[] {
	return [...text.slice(from, to).matchAll(AUTOLINK)].map((m) => ({
		from: from + m.index,
		to: from + m.index + m[0].length
	}));
}

function closesLinkText(text: string, from: number, close: number): boolean {
	let depth = 0;
	for (let i = close - 1; i >= from; i--) {
		if (text[i - 1] === '\\') continue;
		if (text[i] === ']') depth++;
		else if (text[i] === '[' && depth-- === 0) return true;
	}
	return false;
}

/** past the ) of a link's (dest "title"), or -1 when it makes no link */
function linkTailEnd(text: string, at: number, to: number): number {
	let i = at;
	while (text[i] === ' ' || text[i] === '\t') i++;
	if (text[i] === '<') {
		ANGLE_DESTINATION.lastIndex = i;
		if (!ANGLE_DESTINATION.test(text)) return -1;
		i = ANGLE_DESTINATION.lastIndex;
	} else {
		for (let depth = 0; i < to && text[i] > ' '; i++) {
			if (text[i] === '\\') i++;
			else if (text[i] === '(') depth++;
			else if (text[i] === ')' && depth-- === 0) break;
		}
	}
	while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
	const quote = text[i];
	if (quote === '"' || quote === "'" || quote === '(') {
		const close = text.indexOf(quote === '(' ? ')' : quote, i + 1);
		if (close < 0 || close >= to) return -1;
		i = close + 1;
		while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
	}
	return i < to && text[i] === ')' ? i + 1 : -1;
}

function linkDestinations(text: string, from: number, to: number): CodeRange[] {
	const destinations: CodeRange[] = [];
	for (let at = text.indexOf('](', from); at >= 0 && at < to; at = text.indexOf('](', at + 1)) {
		if (text[at - 1] === '\\' || !closesLinkText(text, from, at)) continue;
		const end = linkTailEnd(text, at + 2, to);
		if (end > 0) destinations.push({ from: at + 1, to: end });
	}
	return destinations;
}

function mergeRanges(ranges: CodeRange[]): CodeRange[] {
	const merged: CodeRange[] = [];
	for (const range of ranges.sort((a, b) => a.from - b.from)) {
		const last = merged[merged.length - 1];
		if (last && range.from < last.to) last.to = Math.max(last.to, range.to);
		else merged.push({ ...range });
	}
	return merged;
}

function paragraphCode(text: string, from: number, to: number): CodeRange[] {
	const spans = codeSpans(text, from, to);
	const links = [...autolinks(text, from, to), ...linkDestinations(text, from, to)];
	return mergeRanges([...spans, ...links.filter((link) => !insideCode(spans, link.from))]);
}

export function markdownCodeRanges(text: string): CodeRange[] {
	const ranges: CodeRange[] = [];
	let paragraph = -1;
	let fence: { from: number; mark: string } | null = null;
	let indented: CodeRange | null = null;
	// an indented line inside a list continues the item, so it is not code
	let inList = false;
	let pos = 0;
	function endParagraph(end: number): void {
		if (paragraph >= 0) ranges.push(...paragraphCode(text, paragraph, end));
		paragraph = -1;
	}
	for (const line of text.split('\n')) {
		const end = pos + line.length;
		const blank = !line.trim();
		if (indented && !blank && !INDENTED_CODE.test(line)) {
			ranges.push(indented);
			indented = null;
		}
		if (fence) {
			const close = FENCE_CLOSE.exec(line);
			if (close && close[1][0] === fence.mark[0] && close[1].length >= fence.mark.length) {
				ranges.push({ from: fence.from, to: end });
				fence = null;
			}
		} else if (indented) {
			if (!blank) indented.to = end + 1;
		} else if (paragraph < 0 && !inList && !blank && INDENTED_CODE.test(line)) {
			indented = { from: pos, to: end + 1 };
		} else {
			const open = FENCE_OPEN.exec(line);
			// a backtick fence's info string has no backtick, or it is a code span
			if (open && !(open[1][0] === '`' && line.slice(open[0].length).includes('`'))) {
				endParagraph(pos);
				fence = { from: pos, mark: open[1] };
			} else if (blank) endParagraph(pos);
			else {
				if (LIST_ITEM.test(line)) inList = true;
				else if (paragraph < 0 && !/^[ \t]/.test(line)) inList = false;
				if (paragraph < 0) paragraph = pos;
			}
		}
		pos = end + 1;
	}
	if (indented) ranges.push(indented);
	endParagraph(text.length);
	if (fence) ranges.push({ from: fence.from, to: text.length + 1 });
	return ranges;
}

export function insideCode(ranges: readonly CodeRange[], pos: number): boolean {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid].to <= pos) lo = mid + 1;
		else if (ranges[mid].from >= pos) hi = mid - 1;
		else return true;
	}
	return false;
}

/** code blanked to spaces, so no $ inside it reads as math */
export function blankCode(text: string, ranges: readonly CodeRange[]): string {
	let out = '';
	let at = 0;
	for (const { from, to } of ranges) {
		out += text.slice(at, from) + text.slice(from, to).replace(/[^\n]/g, ' ');
		at = Math.min(to, text.length);
	}
	return out + text.slice(at);
}
