import type { TocItem } from './tocStore';

// mirror the parser's section-level mapping (converter.ts) so the source outline nests the same
// way the visual one does
const HEADING_LEVEL: Record<string, number> = {
	part: 1,
	chapter: 1,
	section: 1,
	subsection: 2,
	subsubsection: 3,
	paragraph: 4,
	subparagraph: 5
};

// read from the '{' at `open` to its matching '}', returning the inner text and the index past '}'
function readGroup(src: string, open: number): { inner: string; end: number } {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const c = src[i];
		if (c === '\\') {
			i++; // skip an escaped char so \{ / \} don't shift the balance
			continue;
		}
		if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return { inner: src.slice(open + 1, i), end: i + 1 };
	}
	return { inner: src.slice(open + 1), end: src.length };
}

// strip inner commands/braces for a readable label: \textbf{Foo} -> Foo, \LaTeX -> ''
function cleanTitle(s: string): string {
	return s
		.replace(/\\[a-zA-Z@]+\*?/g, ' ')
		.replace(/\\\\/g, ' ')
		.replace(/[{}~]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// true if `i` sits after an unescaped % on its own line (a commented-out heading)
function inComment(src: string, i: number): boolean {
	for (let j = src.lastIndexOf('\n', i - 1) + 1; j < i; j++) {
		if (src[j] === '\\') j++;
		else if (src[j] === '%') return true;
	}
	return false;
}

const HEADING_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;

/** parses \part..\subparagraph headings from raw LaTeX; `pos` is a char offset into `src`, which
 *  maps 1:1 to CodeMirror positions (the source editor holds LF-normalized text verbatim). */
export function latexHeadings(src: string): TocItem[] {
	const items: TocItem[] = [];
	HEADING_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = HEADING_RE.exec(src))) {
		if (inComment(src, m.index)) continue;
		const braceOpen = HEADING_RE.lastIndex - 1; // the '{' the regex just consumed
		const { inner, end } = readGroup(src, braceOpen);
		items.push({ level: HEADING_LEVEL[m[1]] ?? 1, text: cleanTitle(inner) || m[1], pos: m.index });
		HEADING_RE.lastIndex = end; // resume past the title so braces inside it don't re-trigger
	}
	return items;
}
