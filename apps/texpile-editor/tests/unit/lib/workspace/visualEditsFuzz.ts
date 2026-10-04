import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Node as PMNode, MarkType } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { canSplit } from 'prosemirror-transform';
import { bodyOffsetOf, parseLatexFile, parseLatexRegion, serializeLatexFile, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownFile, parseMarkdownRegion, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile, parseTypstRegion, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import type { RegionParser } from '$lib/editor/visual/sourceSpans';
import type { OldRun, PmSuggestionRange, SuggestionSource } from '$lib/editor/visual/extensions/pmSuggestionsPlace';

export type Format = {
	name: 'tex' | 'md' | 'typ';
	parse: (text: string) => ParsedLatexFile;
	serialize: (meta: ParsedLatexFile, doc: PMNode) => string;
	/** parses a stretch of the body as `parse` parsed the file */
	region: (meta: ParsedLatexFile) => RegionParser;
	files: string[];
};

/** what a placement reads: the file as parsed, its text, and the stretch of it the document is */
export function suggestionSource(f: Format, meta: ParsedLatexFile, text: string): SuggestionSource {
	const from = bodyOffsetOf(meta);
	const to = meta.hadDocumentEnv ? text.length - meta.postamble.length : text.length;
	return { text, map: meta.map, body: { from, to }, parse: f.region(meta) };
}

/** a drawn range's old content the way renderedText reads a document: one # per node that is not text */
/**
 * What a drawn range reads as once put back, for renderedText: a break mark is the break itself, a
 * node outline is the node it was (a block on its own line, an inline one as the # the reading gives
 * any inline node), a block that only changed kind reads the same, and words are the old words
 */
export function drawnReading(r: PmSuggestionRange): { from: number; to: number; words: string } | null {
	if (r.partial) return null;
	if (r.brk)
		return r.brk === 'removed'
			? { from: r.from, to: r.to, words: `\n${oldWordsOf(r)}` }
			: { from: r.from, to: r.from + 2, words: oldWordsOf(r) };
	if (r.node) {
		if (r.format) return null;
		const was = r.was ? (r.was.isInline ? '#' : `\n${renderedText(r.was)}`) : oldWordsOf(r);
		return { from: r.from, to: r.to, words: was };
	}
	return { from: r.from, to: r.to, words: oldWordsOf(r) };
}

export function oldWordsOf(r: PmSuggestionRange): string {
	const runs = (old: OldRun[]) => old.map((run) => (run.node ? '#' : run.text)).join('');
	if (r.gone) return `${runs(r.gone.head)}\n${r.gone.blocks.map((b) => renderedText(b)).join('\n')}\n${runs(r.gone.tail)}`;
	return runs(r.old);
}

const FIXTURES = join(__dirname, '../../../fixtures');
const LIVE = join(__dirname, '../../../live/fixtures');
const DOCS = join(__dirname, '../../../../../../docs');

export function walk(dir: string, ext: RegExp, max = 400_000): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir).sort()) {
		if (name === '_draft') continue;
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) out.push(...walk(p, ext, max));
		else if (ext.test(name) && st.size < max) out.push(p);
	}
	return out;
}

export const FORMATS: Format[] = [
	{
		name: 'tex',
		parse: (t) => parseLatexFile(t),
		serialize: serializeLatexFile,
		region: (meta) => (src) => parseLatexRegion(src, meta.preamble),
		files: [join(FIXTURES, 'comments/feature-sweep.tex'), ...walk(LIVE, /\.tex$/, process.env.VISUAL_FUZZ_RUNS ? 120_000 : 16_000)]
	},
	{
		name: 'md',
		parse: (t) => parseMarkdownFile(t),
		serialize: serializeMarkdownFile,
		region: () => parseMarkdownRegion,
		files: [join(FIXTURES, 'comments/feature-sweep.md'), join(FIXTURES, 'comments/guide.md'), ...walk(DOCS, /\.md$/)]
	},
	{
		name: 'typ',
		parse: (t) => parseTypstFile(t),
		serialize: serializeTypstFile,
		region: () => parseTypstRegion,
		files: [join(FIXTURES, 'comments/feature-sweep.typ')]
	}
];
for (const dir of (process.env.VISUAL_FUZZ_CORPUS ?? '').split(';').filter(Boolean)) {
	for (const f of FORMATS) f.files.push(...walk(dir, new RegExp(`\\.${f.name}$`), 120_000));
}
const only = process.env.VISUAL_FUZZ_FILE;
if (only) for (const f of FORMATS) f.files = f.files.filter((p) => p.replace(/\\/g, '/').includes(only));

const PIECES = [
	'a',
	'b',
	'x',
	'the',
	'word',
	'Foo',
	'42',
	'3.14',
	' ',
	' ',
	' ',
	'  ',
	' ',
	...'%$&#_{}~^\\*-+=/<>@[]()`|!"\'.,:;?',
	'--',
	'---',
	'...',
	'1.',
	'- ',
	'# ',
	'> ',
	'= ',
	'+ ',
	'\\\\',
	'//',
	'/*',
	'<!--',
	'\\section',
	'\\textbf{',
	'$x$',
	'*a*',
	'_b_',
	'[x](y)',
	'@key',
	'<lab>',
	'中文',
	'😀',
	'é'
];

export function prng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function pick<T>(rnd: () => number, xs: T[]): T {
	return xs[Math.floor(rnd() * xs.length)];
}

export function typed(rnd: () => number): string {
	let s = '';
	const n = 1 + Math.floor(rnd() * 4);
	for (let i = 0; i < n; i++) s += pick(rnd, PIECES);
	return s;
}

export type Block = { node: PMNode; pos: number; cell: number };

export function proseBlocks(doc: PMNode): Block[] {
	const out: Block[] = [];
	let cell = -1;
	let cellEnd = -1;
	doc.descendants((node, pos) => {
		if (node.type.spec.code) return false;
		if (pos >= cellEnd) cell = -1;
		if (/^table_(cell|header)$/.test(node.type.name)) {
			cell = pos;
			cellEnd = pos + node.nodeSize;
		}
		if (node.isTextblock) {
			out.push({ node, pos, cell });
			return false;
		}
		return true;
	});
	return out;
}

export function spotIn(doc: PMNode, b: Block, rnd: () => number): number | null {
	for (let tries = 0; tries < 6; tries++) {
		const p = b.pos + 1 + Math.floor(rnd() * (b.node.content.size + 1));
		if (doc.resolve(p).parent === b.node) return p;
	}
	return b.node.content.size === 0 ? b.pos + 1 : null;
}

/** what a reader sees, with drawn old words spliced in where their suggestion sits */
export function renderedText(doc: PMNode, drawn: { from: number; to: number; words: string }[] = []): string {
	let chars: { ch: string; pos: number; old?: boolean }[] = [];
	doc.descendants((node, pos) => {
		if (node.isTextblock) chars.push({ ch: '\n', pos: pos + 0.5 });
		else if (node.isText) for (let i = 0; i < node.text!.length; i++) chars.push({ ch: node.text![i], pos: pos + i });
		else if (node.isInline) chars.push({ ch: '#', pos });
		return !node.isInline;
	});
	for (const r of [...drawn].sort((a, b) => b.from - a.from)) {
		const kept = chars.filter((c) => c.old || !(c.pos >= r.from && c.pos < r.to));
		// past any words already put at this very spot, so two of them keep the order they were given
		// in: the editor draws them that way, and it is the order the file holds them in
		const at = kept.findIndex((c) => c.pos >= r.from && !(c.old && c.pos === r.from));
		kept.splice(at < 0 ? kept.length : at, 0, ...[...r.words].map((ch) => ({ ch, pos: r.from, old: true })));
		chars = kept;
	}
	return chars
		.map((c) => c.ch)
		.join('')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n[\s]*/g, '\n')
		.trim();
}

export type Edit = { label: string; tr: Transaction };

// A formula's content is its source and mathlive draws it, so spotIn can never land in one and without
// this no edit ever reaches the tier that draws a changed formula. Chips are left out on purpose: their
// content is the DIALECT's source, latex in a .tex file and typst in a .typ one, so nothing written here
// would be right for both.
const OWN_SOURCE = new Set(['inline_math', 'block_math']);

// Only ever at the END, and only things that are valid after any balanced formula. An equation editor
// writes a whole formula back, so an edit in one never leaves half a command or an environment with
// something wedged between its name and its argument - and latex that will not parse tests the parser,
// which has its own oracles, rather than what draws the change.
const SOURCE_BITS = [' + 1', ' = 0', ' x', ' - y', ' \\alpha', ' 2'];

function sourceNodes(doc: PMNode): { node: PMNode; pos: number }[] {
	const out: { node: PMNode; pos: number }[] = [];
	doc.descendants((node, pos) => {
		if (!OWN_SOURCE.has(node.type.name)) return true;
		// an environment's body ends at \end{...}, so nothing typed after it is in the maths at all
		if (node.content.size && !node.textContent.includes('\\begin{')) out.push({ node, pos });
		return false;
	});
	return out;
}

function editSource(state: EditorState, rnd: () => number): Edit | null {
	const inside = sourceNodes(state.doc);
	if (!inside.length) return null;
	const { node, pos } = pick(rnd, inside);
	const from = pos + 1;
	const tr = state.tr;
	const src = node.textContent;
	const where = `${node.type.name}@${pos} ${JSON.stringify(src.slice(0, 24))}`;
	const end = from + node.content.size;
	// backspace at the end of a formula, when what it takes is one plain character and what is left is
	// still a formula: emptying one, or leaving a ^ with nothing under it, is not an edit an equation
	// editor makes and the latex it leaves is nobody's to parse
	if (rnd() < 0.4 && /[a-zA-Z0-9+\-=]$/.test(src) && !/\\[a-zA-Z]$/.test(src) && /[^\s^_\\{]\s*.$/.test(src)) {
		tr.delete(end - 1, end);
		return { label: `cut ${JSON.stringify(src.slice(-1))} from the end of ${where}`, tr };
	}
	const bit = pick(rnd, SOURCE_BITS);
	tr.insertText(bit, end);
	return { label: `type ${JSON.stringify(bit)} at the end of ${where}`, tr };
}

/** `formulas` also edits inside maths. Off by default: the round-trip oracle reaches a latex
 *  normalisation there that is nothing to do with what the edit was, and has its own oracles */
export function randomEdit(state: EditorState, rnd: () => number, formulas = false): Edit | null {
	const doc = state.doc;
	// drawn whether or not it is used, so the same seed walks the same edits with maths on or off and a
	// run that fails can be replayed both ways
	const maths = rnd() < 0.12;
	if (formulas && maths) {
		const edit = editSource(state, rnd);
		if (edit) return edit;
	}
	const blocks = proseBlocks(doc);
	if (!blocks.length) return null;
	const b = pick(rnd, blocks);
	const tr = state.tr;
	const roll = rnd();
	const at = spotIn(doc, b, rnd);
	if (at === null) return null;
	const where = `${b.node.type.name}@${b.pos} "${b.node.textContent.slice(0, 30)}"`;
	try {
		if (roll < 0.45) {
			const s = typed(rnd);
			tr.insertText(s, at);
			return { label: `type ${JSON.stringify(s)} at ${at - b.pos - 1} in ${where}`, tr };
		}
		if (roll < 0.6) {
			const other = spotIn(doc, b, rnd);
			if (other === null || other === at) return null;
			const [from, to] = [Math.min(at, other), Math.max(at, other)];
			const words = doc.textBetween(from, to, '', '*');
			tr.delete(from, to);
			return { label: `delete ${JSON.stringify(words)} in ${where}`, tr };
		}
		if (roll < 0.7) {
			const b2 = pick(rnd, blocks);
			if (b2.cell !== b.cell) return null;
			const other = spotIn(doc, b2, rnd);
			if (other === null) return null;
			const [from, to] = [Math.min(at, other), Math.max(at, other)];
			if (to - from > 400) return null;
			tr.delete(from, to);
			return { label: `delete across ${JSON.stringify(doc.textBetween(from, to, '|', '*'))} from ${where}`, tr };
		}
		if (roll < 0.8) {
			if (!canSplit(doc, at)) return null;
			tr.split(at);
			return { label: `split at ${at - b.pos - 1} in ${where}`, tr };
		}
		if (roll < 0.87) {
			const i = blocks.indexOf(b);
			if (i === 0) return null;
			const prev = blocks[i - 1];
			if (prev.cell !== b.cell) return null;
			tr.delete(prev.pos + prev.node.nodeSize - 1, b.pos + 1);
			return { label: `join ${where} onto the block before`, tr };
		}
		if (roll < 0.95) {
			const other = spotIn(doc, b, rnd);
			if (other === null || other === at) return null;
			const [from, to] = [Math.min(at, other), Math.max(at, other)];
			const marks = ['strong', 'em'].map((n) => doc.type.schema.marks[n]).filter(Boolean) as MarkType[];
			const mark = pick(rnd, marks);
			if (!b.node.type.allowsMarkType(mark)) return null;
			if (rnd() < 0.7) tr.addMark(from, to, mark.create());
			else tr.removeMark(from, to, mark);
			return { label: `${mark.name} ${JSON.stringify(doc.textBetween(from, to, '', '*'))} in ${where}`, tr };
		}
		const br = doc.type.schema.nodes.hard_break;
		const $at = doc.resolve(at);
		if (!br || !$at.parent.canReplaceWith($at.index(), $at.index(), br)) return null;
		tr.replaceWith(at, at, br.create());
		return { label: `line break at ${at - b.pos - 1} in ${where}`, tr };
	} catch {
		return null;
	}
}
