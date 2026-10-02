// prose word counts of LaTeX and Typst files, by the parts a word limit names
import { maskTex } from '$lib/editor/spellcheck/texMask';
import { codeOnly } from '$lib/languages/latex/texCode';

export type WordTally = { body: number; headings: number; captions: number; footnotes: number; tables: number };

export const WORD_PARTS = ['body', 'headings', 'captions', 'footnotes', 'tables'] as const satisfies readonly (keyof WordTally)[];

export const NO_WORDS: WordTally = { body: 0, headings: 0, captions: 0, footnotes: 0, tables: 0 };

export function addTally(a: WordTally, b: WordTally): WordTally {
	const out = { ...a };
	for (const part of WORD_PARTS) out[part] += b[part];
	return out;
}

export function tallyTotal(t: WordTally): number {
	return WORD_PARTS.reduce((n, part) => n + t[part], 0);
}

type Part = Exclude<keyof WordTally, 'body'>;
type Region = { from: number; to: number; part: Part };

const WORD = /\S+/g;
const HAS_LETTER = /[\p{L}\p{N}]/u;

/** `text` keeps the source's offsets, so the regions still line up */
function tally(text: string, regions: Region[]): WordTally {
	const out = { ...NO_WORDS };
	regions.sort((a, b) => a.from - b.from);
	for (const w of text.matchAll(WORD)) {
		if (!HAS_LETTER.test(w[0])) continue;
		const at = w.index ?? 0;
		// innermost region wins: a caption inside a footnote is a caption
		let part: keyof WordTally = 'body';
		for (const r of regions) {
			if (r.from > at) break;
			if (at < r.to) part = r.part;
		}
		out[part]++;
	}
	return out;
}

export type ProseCount = { words: number; characters: number; charactersWithSpaces: number };

/** with spaces, each gap between two runs of text is one, however much markup was blanked there */
export function countProse(text: string): ProseCount {
	let words = 0;
	let characters = 0;
	let gaps = 0;
	for (const w of text.matchAll(WORD)) {
		if (HAS_LETTER.test(w[0])) words++;
		if (characters) gaps++;
		characters += w[0].length;
	}
	return { words, characters, charactersWithSpaces: characters + gaps };
}

export type FileCount = {
	words: WordTally;
	/** with spaces, as the top bar counts them */
	characters: number;
};

function fileCount({ text, regions }: { text: string; regions: Region[] }): FileCount {
	return { words: tally(text, regions), characters: countProse(text).charactersWithSpaces };
}

const CLOSER: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

function closing(src: string, open: number): number {
	const o = src[open];
	const c = CLOSER[o];
	if (!c) return -1;
	let depth = 0;
	for (let k = open; k < src.length; k++) {
		const ch = src[k];
		if (ch === '\\') k++;
		else if (ch === o) depth++;
		else if (ch === c && --depth === 0) return k;
	}
	return -1;
}

// accents written as commands (caf\'e, na\"{\i}ve, \v{c}) would split a word: the letter stands for it
const ACCENT = /\\(?:['"^`~=.]\s*|[uvHcdbrtk](?=\{))(?:\{\s*(\\?[A-Za-z])\s*\}|([A-Za-z]))/g;
// a letter written as a command, which like any control word takes the spaces after it: Stra\ss e
const LETTER_COMMAND = /\\(?:ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i|j)(?![A-Za-z])(?:\{\}|[ \t]*)/g;

const LATEX_PARTS: [RegExp, Part][] = [
	[/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*(?=\{)/g, 'headings'],
	[/\\caption\*?\s*(?:\[[^\]]*\])?\s*(?=\{)/g, 'captions'],
	[/\\footnote(?:text)?\s*(?:\[[^\]]*\])?\s*(?=\{)/g, 'footnotes'],
	[/\\title\s*(?:\[[^\]]*\])?\s*(?=\{)/g, 'headings']
];

// a caption inside a table (longtable) is still a caption
const TABLE_ENV = /\\begin\{(tabular\*?|tabularx|tabulary|longtable\*?|supertabular|tblr)\}[\s\S]*?\\end\{\1\}/g;

/** `main`: the file with \begin{document}, so only its body counts, plus the \title that \maketitle prints */
export function latexCount(source: string, main: boolean): FileCount {
	return fileCount(latexText(source, main));
}

export function latexProse(source: string, main: boolean): string {
	return latexText(source, main).text;
}

function latexText(source: string, main: boolean): { text: string; regions: Region[] } {
	let src = source
		.replace(ACCENT, (_, braced?: string, bare?: string) => (braced ?? bare ?? '').replace('\\', ''))
		.replace(LETTER_COMMAND, 'x');
	if (main) {
		const code = codeOnly(src);
		const begin = /\\begin\s*\{document\}/.exec(code);
		if (begin) {
			const from = begin.index + begin[0].length;
			const end = code.indexOf('\\end{document}', from);
			const body = src.slice(from, end < 0 ? undefined : end);
			let preamble = ' '.repeat(from);
			const title = /\\title\s*(?:\[[^\]]*\])?\s*\{/.exec(code.slice(0, from));
			const titleEnd = title ? closing(src, title.index + title[0].length - 1) : -1;
			if (title && titleEnd > 0 && /\\maketitle\b/.test(code.slice(from, end < 0 ? undefined : end)))
				preamble = preamble.slice(0, title.index) + src.slice(title.index, titleEnd + 1) + preamble.slice(titleEnd + 1);
			src = preamble + body;
		}
	}
	// the list of references is the bibliography's, not the author's prose
	src = src.replace(/\\begin\{thebibliography\}[\s\S]*?(?:\\end\{thebibliography\}|$)/g, (m) => ' '.repeat(m.length));

	const regions: Region[] = [];
	for (const [re, part] of LATEX_PARTS) {
		for (const m of src.matchAll(re)) {
			const open = (m.index ?? 0) + m[0].length;
			const close = closing(src, open);
			if (close > open) regions.push({ from: open, to: close, part });
		}
	}
	for (const m of src.matchAll(TABLE_ENV)) regions.push({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, part: 'tables' });
	return { text: maskTex(src).text, regions };
}

function blank(text: string): string {
	return text.replace(/[^\n]/g, ' ');
}

export function typstCount(source: string): FileCount {
	return fileCount(typstText(source));
}

export function typstProse(source: string): string {
	return typstText(source).text;
}

function typstText(source: string): { text: string; regions: Region[] } {
	let src = source
		.replace(/\/\*[\s\S]*?\*\//g, blank)
		.replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
		.replace(/```[\s\S]*?```/g, blank)
		.replace(/`[^`\n]*`/g, blank)
		.replace(/\$[^$]*\$/g, blank)
		// references and labels
		.replace(/(?<![\w@])@[\w:.-]*\w|<[\w:.-]+>/g, blank);

	src = blankCode(src);

	const regions: Region[] = [];
	for (const m of src.matchAll(/^[ \t]*(=+)[ \t]+[^\n]*/gm))
		regions.push({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, part: 'headings' });
	for (const [re, part] of [
		[/caption\s*:\s*(?=\[)/g, 'captions'],
		[/#footnote\s*(?=\[)/g, 'footnotes'],
		[/#table\s*(?=\()/g, 'tables']
	] as const) {
		for (const m of source.matchAll(re)) {
			const open = (m.index ?? 0) + m[0].length;
			const close = closing(source, open);
			if (close > open) regions.push({ from: open, to: close, part });
		}
	}
	// what is left of the markup: emphasis marks, list markers, the = of a heading, a # call name
	const text = src.replace(/#[\w.-]+/g, blank).replace(/[*_=#[\]]/g, ' ');
	return { text, regions };
}

/** keeps [content] blocks, which are prose, and every offset */
function blankCode(src: string): string {
	const out = src.split('');
	function blankRange(from: number, to: number) {
		for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
	}
	for (const m of src.matchAll(/#(?:let|set|show|import|include)\b[^\n]*/g)) {
		let end = (m.index ?? 0) + m[0].length;
		const opened = m[0].search(/[([{]/);
		if (opened >= 0) {
			const close = closing(src, (m.index ?? 0) + opened);
			if (close > end) end = close + 1;
		}
		blankRange(m.index ?? 0, end);
	}
	for (const m of src.matchAll(/#[\w.]+(?=\()/g)) {
		const open = (m.index ?? 0) + m[0].length;
		const close = closing(src, open);
		if (close < 0) continue;
		const keep: [number, number][] = [];
		for (let k = open; k < close; k++) {
			if (src[k] !== '[') continue;
			const end = closing(src, k);
			if (end < 0 || end > close) break;
			keep.push([k + 1, end]);
			k = end;
		}
		const saved = keep.map(([a, b]) => out.slice(a, b));
		blankRange(open, close + 1);
		keep.forEach(([a], i) => saved[i].forEach((ch, j) => (out[a + j] = ch)));
	}
	return out.join('');
}
