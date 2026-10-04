// markdown-it's inline tokens carry no positions. This plugin stamps every inline token with the
// range of the inline content it was read from, and leaves text pieces unmerged so each keeps its
// own; the converter then finds each content line at the end of its source line, which is where
// markdown-it's own slicing leaves it (it strips markers and indentation, never the tail)
import type { MarkdownIt, StateInline, Token } from 'markdown-it';
import { alignedSpans, bytesSpan, type LeafSpan } from '$lib/editor/visual/sourceSpans';

/** a range of the inline content a token was read from */
export type ContentRange = { from: number; to: number };

type Pending = { from: number; to: number; len: number };
const pendings = new WeakMap<StateInline, Pending>();

export function rangeOf(tok: Token): ContentRange | null {
	const at = (tok.meta as { at?: ContentRange } | null)?.at;
	return at && at.from >= 0 && at.to >= at.from ? at : null;
}

function stamp(draft: Token, from: number, to: number): void {
	const meta = (draft.meta ??= {}) as { at?: ContentRange };
	if (!meta.at) meta.at = { from, to };
}

// a delimiter run is pushed as one text piece per delimiter (`**` is two `*`), each of which reads
// as its own character when the run matches nothing: every piece its own bytes, or the two claim both
function stampRead(state: StateInline, n: number, start: number): void {
	// the text pending before the rule is flushed into the same stretch, already stamped
	const pushed = state.tokens.slice(n).filter((t) => !rangeOf(t));
	const pieces =
		pushed.length > 1 &&
		pushed.every((t) => t.type === 'text') &&
		pushed.map((t) => t.content).join('') === state.src.slice(start, state.pos);
	let at = start;
	for (const t of pushed) {
		const to = pieces ? at + t.content.length : state.pos;
		stamp(t, pieces ? at : start, to);
		at = to;
	}
}

// text the tokenizer appended itself, one character per position, since the last rule ran
function catchUp(state: StateInline, draft: Pending): void {
	if (state.pending.length <= draft.len) return;
	if (draft.len === 0) draft.from = state.pos - state.pending.length;
	draft.to = state.pos;
	draft.len = state.pending.length;
}

export function positionsPlugin(md: MarkdownIt): void {
	type Rule = { fn: (state: StateInline, silent: boolean) => boolean };
	const ruler = md.inline.ruler as unknown as { __rules__: Rule[]; __cache__: unknown };
	for (const rule of ruler.__rules__) {
		const fn = rule.fn;
		rule.fn = (state, silent) => {
			if (silent) return fn(state, silent);
			let p = pendings.get(state);
			if (!p) pendings.set(state, (p = { from: 0, to: 0, len: 0 }));
			catchUp(state, p);
			const start = state.pos;
			const n = state.tokens.length;
			const ok = fn(state, silent);
			if (!ok) return ok;
			stampRead(state, n, start);
			const len = state.pending.length;
			if (len > p.len) {
				if (p.len === 0) p.from = start;
				p.to = state.pos;
			} else if (len < p.len) p.to -= p.len - len; // a line end trimmed the spaces before it
			p.len = len;
			return ok;
		};
	}
	ruler.__cache__ = null;

	// a class of this instance's own: every markdown-it instance shares the one State it starts with
	const inline = md.inline;
	inline.State = class extends inline.State {
		override pushPending(): Token {
			const p = pendings.get(this);
			if (p) catchUp(this, p);
			const tok = super.pushPending();
			if (p) {
				stamp(tok, p.from, p.to);
				p.len = 0;
			}
			return tok;
		}
	};

	// the joins that would merge pieces read from different places: only their other work stays
	md.core.ruler.at('text_join', (state) => {
		for (const block of state.tokens) {
			if (block.type !== 'inline' || !block.children) continue;
			for (const t of block.children) if (t.type === 'text_special') t.type = 'text';
		}
	});
	md.inline.ruler2.at('fragments_join', (state) => {
		let level = 0;
		for (const t of state.tokens) {
			if (t.nesting < 0) level--;
			t.level = level;
			if (t.nesting > 0) level++;
		}
	});
}

export type SourceLines = { source: string; lineStarts: number[] };

/** a source line without its line break */
export function lineSpan(s: SourceLines, line: number): { from: number; to: number } {
	const from = line < s.lineStarts.length ? s.lineStarts[line] : s.source.length;
	let to = line + 1 < s.lineStarts.length ? s.lineStarts[line + 1] - 1 : s.source.length;
	if (to > from && s.source[to - 1] === '\r') to--;
	return { from, to: Math.max(from, to) };
}

// a content line sits at the end of its source line, after the markers and indentation that were
// stripped; the latest place it fits with only whitespace after it, or the closing hashes of a
// heading, the one tail markdown-it strips
function endOfLine(srcLine: string, content: string): number {
	let at = srcLine.lastIndexOf(content);
	while (at >= 0 && !/^\s*(?:#+\s*)?$/.test(srcLine.slice(at + content.length))) at = at === 0 ? -1 : srcLine.lastIndexOf(content, at - 1);
	return at;
}

/**
 * Where each of `lines` starts in the source, read from source line `first` on and never past
 * `last`: every content line is found on a later source line than the one before it, so fence
 * lines and blank lines between are stepped over. null for a line that is nowhere
 */
export function locateLines(s: SourceLines, first: number, last: number, lines: string[]): (number | null)[] {
	const out: (number | null)[] = [];
	let cur = first;
	for (const line of lines) {
		let found: number | null = null;
		for (let l = cur; l < last; l++) {
			const span = lineSpan(s, l);
			const at = endOfLine(s.source.slice(span.from, span.to), line);
			if (at < 0) continue;
			found = span.from + at;
			cur = l + 1;
			break;
		}
		out.push(found);
	}
	return out;
}

/** maps an offset in a block's content to the file, or null where the content is nowhere */
export type Locator = (offset: number) => number | null;

function locatorOver(lines: string[], starts: (number | null)[]): Locator {
	const contentStarts: number[] = [];
	let at = 0;
	for (const line of lines) {
		contentStarts.push(at);
		at += line.length + 1;
	}
	return (offset) => {
		let i = 0;
		while (i + 1 < lines.length && contentStarts[i + 1] <= offset) i++;
		const start = starts[i];
		if (start === null) return null;
		const inLine = Math.min(offset - contentStarts[i], lines[i].length);
		return start + inLine;
	};
}

/** the locator for a block's content read from source lines [first, last) */
export function contentLocator(s: SourceLines, first: number, last: number, content: string): Locator {
	const lines = content.split('\n');
	return locatorOver(lines, locateLines(s, first, last, lines));
}

/** the locator for one table cell of the row on `line`, read left to right from `cursor` */
export function cellLocator(s: SourceLines, line: number, cell: string, cursor: number): { at: Locator; cursor: number } {
	const span = lineSpan(s, line);
	const srcLine = s.source.slice(span.from, span.to);
	const found = cell ? srcLine.indexOf(cell, cursor) : -1;
	const start = found < 0 ? null : span.from + found;
	return { at: locatorOver([cell], [start]), cursor: found < 0 ? cursor : found + cell.length };
}

/** the characters of a token's content against the bytes it was read from */
export function textSpans(content: string, from: number, slice: string): LeafSpan[] {
	if (slice === content) return bytesSpan(content.length, from);
	const i = slice.indexOf(content);
	if (i >= 0 && slice.indexOf(content, i + 1) < 0) return bytesSpan(content.length, from + i);
	return alignedSpans(content, from, slice);
}
