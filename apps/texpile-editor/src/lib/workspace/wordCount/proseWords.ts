// prose word counts of LaTeX, Typst and Markdown files, by the parts a word limit names
import { maskTex } from '$lib/editor/spellcheck/texMask';
import { callsIn } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { LETTER_SYMBOLS, ACCENT_COMMANDS } from '$lib/languages/latex/knowledge/commands/texCharacters';
import { codeOnly } from '$lib/languages/latex/texCode';
import { bibliographyPattern, tableEnvPattern } from './envPatterns';

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

function accentClass(letters: boolean): string {
	return [...ACCENT_COMMANDS]
		.filter((name) => /[a-z]/i.test(name) === letters)
		.map((name) => name.replace(/[\\\]^-]/g, '\\$&'))
		.join('');
}

// accents written as commands (caf\'e, na\"{\i}ve, \v{c}) would split a word: the letter stands for it
const ACCENT = new RegExp(
	String.raw`\\(?:[${accentClass(false)}]\s*|[${accentClass(true)}](?=\{))(?:\{\s*(\\?[A-Za-z])\s*\}|([A-Za-z]))`,
	'g'
);
// a letter written as a command, which like any control word takes the spaces after it: Stra\ss e
const LETTER_COMMAND = new RegExp(String.raw`\\(?:${LETTER_SYMBOLS.join('|')})(?![A-Za-z])(?:\{\}|[ \t]*)`, 'g');

const PART_OF_ARGUMENT = { heading: 'headings', caption: 'captions', footnote: 'footnotes' } as const;

/** the arguments of `code` that data names as a heading, caption or footnote, those inside another call's included */
function partRegions(code: string, offset = 0): Region[] {
	const out: Region[] = [];
	for (const call of callsIn(code, ['text'])) {
		for (const a of call.args) {
			if (a.arg.part && a.arg.part !== 'short') out.push({ from: offset + a.from, to: offset + a.to, part: PART_OF_ARGUMENT[a.arg.part] });
			out.push(...partRegions(code.slice(a.from, a.to), offset + a.from));
		}
	}
	return out;
}

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
			const title = callsIn(code.slice(0, from), ['text']).find((c) => c.command === 'title');
			if (title && /\\maketitle\b/.test(code.slice(from, end < 0 ? undefined : end)))
				preamble = preamble.slice(0, title.at) + src.slice(title.at, title.end) + preamble.slice(title.end);
			src = preamble + body;
		}
	}
	// the list of references is the bibliography's, not the author's prose
	src = src.replace(bibliographyPattern(), (m) => ' '.repeat(m.length));

	const regions = partRegions(codeOnly(src));
	// a caption inside a table (longtable) is still a caption
	for (const m of src.matchAll(tableEnvPattern())) regions.push({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, part: 'tables' });
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

const MD_ESCAPABLE = /\\([\\`*_{}[\]()#+\-.!|~<>$])/g;

/** the text the Markdown visual editor shows: no front matter, code blocks, math, images, link targets or markup */
export function markdownProse(source: string): string {
	return source
		.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, blank)
		.replace(/<!--[\s\S]*?-->/g, blank)
		.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*$/gm, blank)
		.replace(/\$\$[\s\S]*?\$\$/g, blank)
		.replace(/(^|[^\\$])\$(?!\s)[^$\n]*?[^\\\s$]\$(?!\d)/g, (m, lead: string) => lead + blank(m.slice(lead.length)))
		.replace(/!\[[^\]]*\]\([^)]*\)/g, blank)
		.replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S.*$/gm, blank)
		.replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
		.replace(/<[^>\n]+>/g, blank)
		.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, blank)
		.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, blank)
		.replace(/^([ \t]*)(?:>[ \t]?)+/gm, '$1')
		.replace(/^([ \t]*)#{1,6}(?=[ \t])/gm, '$1')
		.replace(/^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '$1')
		.replace(MD_ESCAPABLE, '$1')
		.replace(/[*`|]|~~|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, ' ');
}
