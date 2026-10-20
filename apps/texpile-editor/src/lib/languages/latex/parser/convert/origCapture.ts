// verbatim source capture: source extents, raw-slice recovery, and the capture state the
// top-level block pass consumes (armed by latexToProseMirror)
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { textNode, type PmNode } from '../builders';
import { bytesSpan, type LeafSpan } from '$lib/editor/visual/sourceSpans';

export type CaptureHolder = {
	pending: CaptureState | null;
	rawSource: string | null;
};

export const capture: CaptureHolder = { pending: null, rawSource: null };

export type CaptureState = {
	/** The exact source string the AST positions index into. */
	source: string;
	/** End offset of the previous block's span (start of the current inter-block gap). */
	prevEnd: number;
};

/** Min/max offsets over `n`'s position (+ content/args), REJECTING any start before `floor`:
 *  never a legitimate undershoot, always a synthetic/corrupt offset (math script groups have no
 *  real position; a missing `.offset` reads back as 0, which a naive `<` would accept and drag
 *  the span to the file start). `floor` is always cap.prevEnd. */
export function extentOf(n: unknown, floor: number): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;
	if (!n || typeof n !== 'object') return { min, max };
	const node = n as { position?: { start?: { offset?: number }; end?: { offset?: number } }; content?: unknown; args?: unknown[] };
	const p = node.position;
	if (p) {
		if (typeof p.start?.offset === 'number' && p.start.offset >= floor) min = p.start.offset;
		if (typeof p.end?.offset === 'number') max = p.end.offset;
		// a call kept verbatim for its comment holds the groups after it in its span
		const raw = (n as { _raw?: unknown })._raw;
		if (typeof raw === 'string' && typeof p.start?.offset === 'number') max = Math.max(max, p.start.offset + raw.length);
	}
	for (const kids of [node.content, node.args]) {
		if (!Array.isArray(kids)) continue;
		for (const kid of kids) {
			const e = extentOf(kid, floor);
			min = Math.min(min, e.min);
			max = Math.max(max, e.max);
		}
	}
	return { min, max };
}

/** Min/max source offsets across node + content + attached args. recursing matters:
 *  attachMacroArgs can leave the macro's own position covering only the control sequence while
 *  the moved args carry their own, so extending past the node's own end is intentional. the
 *  node's OWN start, when >= floor, is additionally authoritative for the lower bound. */
export function nodeExtent(node: Node, floor = 0): { min: number; max: number } | null {
	const acc = extentOf(node, floor);
	if (acc.min > acc.max) return null;
	const top = (node as unknown as { position?: { start?: { offset?: number } } }).position;
	if (typeof top?.start?.offset === 'number' && top.start.offset >= floor && acc.min < top.start.offset) acc.min = top.start.offset;
	return acc;
}

// byte-faithful raw fallback: raw preservation slices the ORIGINAL bytes via source offsets
// instead of printRaw. printRaw emits a blank line after own-line comments, and a blank line IS
// a \par token: fatal "Runaway argument" inside a non-\long arg (\author, \institute), a silent
// paragraph break in prose. printRaw stays the fallback for nodes without a trustworthy span
// (synthesized nodes, the slotified figureTemplate tree).

/** Net `{`-minus-`}` depth of `s`, ignoring `\{`/`\}` escapes and `%`-comment tails. */
function braceDebt(s: string): number {
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '\\') {
			i++; // skip the escaped char (covers \{ \} \%)
			continue;
		}
		if (ch === '%') {
			while (i < s.length && s[i] !== '\n') i++;
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}') depth--;
	}
	return depth;
}

/**
 * Attached args' brace/bracket delimiters are stripped from the AST (openMark/closeMark
 * metadata, not positioned nodes), so a position-based extent ends just before the final
 * closer(s). reclaim the expected tail from the source: last positioned arg's closeMark, then
 * each later (empty, position-less) arg's marks, whitespace allowed between. returns the
 * repaired end offset, or null when the source disagrees (caller falls back to printRaw).
 */
// TeX reads a closer past a line-end comment as past a space
function pastBlanks(src: string, from: number): number {
	let at = from;
	while (at < src.length) {
		if (/[ \t\r\n]/.test(src[at])) at++;
		else if (src[at] === '%') while (at < src.length && src[at] !== '\n') at++;
		else break;
	}
	return at;
}

export function repairArgTail(node: Node, src: string, endIn: number): number | null {
	if (!(node as Macro).args?.length) return endIn;
	let end = endIn;
	for (const { mark, nested } of closersAfter(node)) {
		// lexical whitespace skip; which closers to expect came from the AST args above
		const at = pastBlanks(src, end);
		if (src[at] === mark) end = at + 1;
		else if (!nested) return null;
	}
	return end;
}

type ArgShape = { openMark: string; closeMark: string; content: Node[] };

// the delimiters after a call's last positioned byte: those of a call its last argument ends in (\item[\x] inside
// {\item[\x]} ends in `]` before the `}`), then its own. A nested call's are there only when the source braced its
// argument: unified-latex records {} around a bare token argument too (\delta \right] taken as \delta{\right}])
function closersAfter(node: Node, nested = false): { mark: string; nested: boolean }[] {
	const args = ((node as Macro).args ?? []) as ArgShape[];
	let last = -1;
	for (let k = args.length - 1; k >= 0; k--) {
		const maxEnd = Math.max(-Infinity, ...args[k].content.map((c) => extentOf(c, 0).max));
		if (Number.isFinite(maxEnd) && maxEnd > 0) {
			last = k;
			break;
		}
	}
	const tail: { mark: string; nested: boolean }[] = [];
	function push(mark: string): void {
		if (mark) tail.push({ mark, nested });
	}
	if (last >= 0) {
		const content = args[last].content;
		const inner = content.reduce<Node | null>((best, c) => (best && extentOf(best, 0).max >= extentOf(c, 0).max ? best : c), null);
		if (inner?.type === 'macro' && (inner as Macro).args?.length && inner === content[content.length - 1])
			tail.push(...closersAfter(inner, true));
		push(args[last].closeMark);
	}
	for (let k = last + 1; k < args.length; k++) {
		push(args[k].openMark);
		push(args[k].closeMark);
	}
	return tail;
}

/**
 * repairArgTail knows the OUTER macro's closers only: an argument that ends in a nested call
 * (`\section{Proof of Theorem~\ref{thm:main}}`) has that call's closer sitting where the outer
 * one is expected, and the span ends one brace short. Consume closers until the slice balances;
 * a `}` right after an unbalanced slice can only close something the slice opened.
 */
function closeUnbalanced(src: string, start: number, end: number): number {
	let debt = braceDebt(src.slice(start, end));
	let closed = end;
	while (debt > 0) {
		const k = pastBlanks(src, closed);
		if (src[k] !== '}') break;
		closed = k + 1;
		debt--;
	}
	return closed;
}

/** Offset just past `\begin{name}` for an environment with a trustworthy position, else null. */
export function envBeginEnd(env: Environment): number | null {
	const src = capture.rawSource;
	const start = (env as { position?: { start?: { offset?: number } } }).position?.start?.offset;
	if (!src || typeof start !== 'number' || !src.startsWith('\\begin', start)) return null;
	const close = src.indexOf('}', start);
	return close < 0 ? null : close + 1;
}

/**
 * The environment's attached arguments as the source wrote them. printRaw normalizes what it
 * prints (`\alph*` comes back as `\alph{*}`, which enumitem rejects), so the bytes are sliced
 * instead: as many bracket or brace groups after `\begin{name}` as the parser attached.
 */
export function envArgsRawSource(env: Environment): string | null {
	const src = capture.rawSource;
	const begin = envBeginEnd(env);
	if (!src || begin == null) return null;
	let end = begin;
	for (let k = 0; k < (env.args?.length ?? 0); k++) {
		let p = end;
		while (p < src.length && /[ \t\r\n]/.test(src[p])) p++;
		const open = src[p];
		if (open !== '[' && open !== '{') break;
		const close = open === '[' ? ']' : '}';
		let depth = 0;
		let q = p;
		for (; q < src.length; q++) {
			if (src[q] === '\\') {
				q++;
				continue;
			}
			if (src[q] === open) depth++;
			else if (src[q] === close && --depth === 0) break;
		}
		if (q >= src.length) return null;
		end = q + 1;
	}
	return src.slice(begin, end).trim();
}

/** a slice of the original source and where it sits */
export type RawSpan = { text: string; from: number; to: number };

/** The node's exact original source slice and its offsets, or null when no trustworthy span exists. */
export function nodeRawSpan(node: Node): RawSpan | null {
	if (!capture.rawSource) return null;
	const ext = nodeExtent(node);
	if (!ext || !Number.isFinite(ext.min) || ext.min < 0 || ext.max > capture.rawSource.length || ext.min >= ext.max) return null;

	let end: number = ext.max;
	if ((node as Macro).args?.length) end = repairArgTail(node, capture.rawSource, ext.max) ?? ext.max;
	end = closeUnbalanced(capture.rawSource, ext.min, end);
	if (end > capture.rawSource.length) return null;

	const slice = capture.rawSource.slice(ext.min, end);
	// every construct sliced here starts with \ or {, and a faithful slice must be
	// brace-balanced: refuse corrupt extents that landed mid-prose.
	if (!/^[\\{]/.test(slice) || braceDebt(slice) !== 0) return null;
	return { text: slice, from: ext.min, to: end };
}

export function nodeRawSource(node: Node): string | null {
	return nodeRawSpan(node)?.text ?? null;
}

/** the text node for a raw slice, mapped byte for byte; the fallback text maps to nothing */
export function rawTextNode(raw: RawSpan | null, fallback: string): PmNode | null {
	return raw ? textNode(raw.text, null, bytesSpan(raw.text.length, raw.from)) : textNode(fallback);
}

/** `text` mapped byte for byte when the source holds exactly it at `from`, else nothing */
export function prefixSpans(text: string, from: number | undefined): LeafSpan[] | null {
	const src = capture.rawSource;
	return src && typeof from === 'number' && from >= 0 && src.startsWith(text, from) ? bytesSpan(text.length, from) : null;
}

/** the bytes an AST node's own position covers, when the parse recorded one */
export function positionSpan(node: unknown): { from: number; to: number } | null {
	const src = capture.rawSource;
	const p = (node as { position?: { start?: { offset?: number }; end?: { offset?: number } } } | null)?.position;
	const from = p?.start?.offset;
	const to = p?.end?.offset;
	if (!src || typeof from !== 'number' || typeof to !== 'number' || from < 0 || to > src.length || from >= to) return null;
	return { from, to };
}

export function startOf(node: unknown): number | undefined {
	return (node as { position?: { start?: { offset?: number } } } | null)?.position?.start?.offset;
}

/** the bytes a macro call covers, attached arguments included; the call itself must be there */
export function macroSpan(macro: Macro): { from: number; to: number } | null {
	const src = capture.rawSource;
	const from = startOf(macro);
	if (!src || typeof from !== 'number' || !src.startsWith('\\' + macro.content, from)) return null;
	const ext = repairExtentTail(macro, nodeExtent(macro, from));
	if (!ext || !Number.isFinite(ext.max) || ext.max > src.length || ext.max <= from) return null;
	return { from, to: ext.max };
}

/**
 * Byte slice of a math container's CONTENT from the container's OWN position, delimiters
 * verified against the source. content-descendant extents aren't trustworthy in math:
 * synthesized script groups default to offset 0, and \frac-style attached args can carry no
 * positions at all (truncating the max, brace-balanced both times so a balance check can't
 * catch it). why slice at all: printRaw re-brackets scripts and seals a script macro away from
 * its trailing argument (`y_\history{i}` becomes `y_{\history}{i}`, a fatal extra-} error).
 * null unless both delimiters match; caller falls back to printRaw.
 */
export function mathBodyRawSpan(node: Node, opens: string[], closes: string[]): RawSpan | null {
	if (!capture.rawSource) return null;
	const src = capture.rawSource;
	const pos = (node as { position?: { start?: { offset?: number }; end?: { offset?: number } } }).position;
	const start = pos?.start?.offset;
	const end = pos?.end?.offset;
	if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end > src.length || start >= end) return null;
	const open = opens.find((o) => src.startsWith(o, start));
	const close = closes.find((c) => end - c.length >= start && src.startsWith(c, end - c.length));
	if (!open || !close || start + open.length > end - close.length) return null;
	const slice = src.slice(start + open.length, end - close.length);
	return braceDebt(slice) === 0 ? { text: slice, from: start + open.length, to: end - close.length } : null;
}

/** a \\[ or $$ display with its delimiters, when its body slices cleanly */
export function displayRawSpan(node: Node): RawSpan | null {
	const body = mathBodyRawSpan(node, ['\\[', '$$'], ['\\]', '$$']);
	if (!body || !capture.rawSource) return null;
	return { text: capture.rawSource.slice(body.from - 2, body.to + 2), from: body.from - 2, to: body.to + 2 };
}

export function mathBodyRawSource(node: Node, opens: string[], closes: string[]): string | null {
	return mathBodyRawSpan(node, opens, closes)?.text ?? null;
}

/** `raw` with the whitespace at its ends dropped, still mapped */
export function trimmedRaw(raw: RawSpan): RawSpan {
	const lead = raw.text.length - raw.text.trimStart().length;
	const text = raw.text.trim();
	return { text, from: raw.from + lead, to: raw.from + lead + text.length };
}

/**
 * Extend ext.max over a macro's attached-arg tail when the source confirms it (repairArgTail).
 * used by the block span capture: a block ending inside an attached argument otherwise gets a
 * truncated span, and the missing closer lands in the inter-block gap, silently lost
 * whenever the next block has no span to re-join the gap across.
 */
export function repairExtentTail(node: Node, ext: { min: number; max: number } | null): { min: number; max: number } | null {
	if (!ext || !capture.rawSource || !Number.isFinite(ext.max) || !Number.isFinite(ext.min)) return ext;
	if (!(node as Macro).args?.length) return ext;
	let end = repairArgTail(node, capture.rawSource, ext.max) ?? ext.max;
	end = closeUnbalanced(capture.rawSource, ext.min, end);
	return end > ext.max ? { min: ext.min, max: end } : ext;
}
