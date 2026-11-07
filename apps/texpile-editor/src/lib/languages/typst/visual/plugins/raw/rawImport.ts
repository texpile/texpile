// raw text: a fenced block of three or more backticks, inline raw between backticks, and `#raw("..")`
import type { SyntaxNode } from '@lezer/common';
import {
	bytesSpan,
	childOf,
	children,
	concatSpans,
	singleArgCall,
	standsFor,
	unquote,
	type LeafSpan,
	type PmMark,
	type PmNode,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

/** a block raw: three or more backticks around at least one line end (typst's own rule). The
 *  Text children are the lines typst keeps after dedenting; RawTrimmed holds what it drops. */
export function fenceBlock(im: TypstImport, k: SyntaxNode): PmNode | null {
	const src = im.src;
	const delim = k.firstChild;
	if (!delim || delim.name !== 'RawDelim' || delim.to - delim.from < 3 || !/[\r\n]/.test(src.slice(k.from, k.to))) return null;
	const lang = childOf(k, 'RawLang');
	const lines = children(k).filter((c) => c.name === 'Text');
	const content = lines.map((c) => src.slice(c.from, c.to)).join('\n');
	// each line is its bytes; the line end between two stands for the break and the indent typst dropped
	const parts: { len: number; spans: LeafSpan[] }[] = [];
	lines.forEach((c, i) => {
		if (i > 0) parts.push({ len: 1, spans: standsFor(1, lines[i - 1].to, c.from) });
		parts.push({ len: c.to - c.from, spans: bytesSpan(c.to - c.from, c.from) });
	});
	const infoString = lang ? src.slice(lang.from, lang.to) : '';
	// no infoString string means NO language recorded: plain text, no settings chip
	return im.core.node('code_block', { lang: infoString, env: 'fence', args: infoString }, im.core.texts(content, null, concatSpans(parts)));
}

/** a block raw interrupts its paragraph in typst too */
export function fenceSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const k = kids[i];
	const fence = fenceBlock(im, k);
	return fence ? { seg: { blocks: [fence], from: k.from, to: k.to }, next: i + 1 } : null;
}

/** ```` ```rust let x``` ```` on one line: the code, where it starts, and the code mark keeping the fences and language */
function fencedInline(raw: SyntaxNode, src: string): { text: string; from: number; mark: PmMark } | null {
	const kids = children(raw);
	const open = kids[0];
	const close = kids[kids.length - 1];
	if (open?.name !== 'RawDelim' || close?.name !== 'RawDelim' || open === close || open.to - open.from < 3) return null;
	if (/[\r\n]/.test(src.slice(raw.from, raw.to))) return null;
	const texts = kids.filter((k) => k.name === 'Text');
	if (!texts.length) return null;
	const from = texts[0].from;
	const to = texts[texts.length - 1].to;
	const typRaw = { open: src.slice(raw.from, from), close: src.slice(to, raw.to) };
	return { text: src.slice(from, to), from, mark: { type: 'code', attrs: { typRaw } } };
}

/** inline raw; unterminated, or a block fence stuck mid-line, it stays literal */
export function inlineRaw(im: TypstImport, nodes: SyntaxNode[], i: number, marks: PmMark[]): { nodes: PmNode[]; next: number } | null {
	const src = im.src;
	const k = nodes[i];
	const delims = children(k).filter((c) => c.name === 'RawDelim');
	const fenced = fencedInline(k, src);
	if (fenced)
		return { nodes: im.core.texts(fenced.text, [...marks, fenced.mark], bytesSpan(fenced.text.length, fenced.from)), next: i + 1 };
	if (delims.length < 2 || delims[0].to - delims[0].from >= 3) return null;
	const inner = src.slice(delims[0].to, delims[delims.length - 1].from);
	return { nodes: im.core.texts(inner, [...marks, { type: 'code' }], bytesSpan(inner.length, delims[0].to)), next: i + 1 };
}

/** `#raw("...")`: the function form of an inline raw, used when the text holds a backtick. */
export function rawCall(im: TypstImport, _hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]): PmNode[] | null {
	const src = im.src;
	const parts = singleArgCall(call, src, 'raw');
	if (!parts || parts.content || parts.arg.name !== 'Str') return null;
	const text = unquote(src.slice(parts.arg.from, parts.arg.to));
	// the string between its quotes, a character a byte where nothing in it is escaped
	const from = parts.arg.from + 1;
	const spans = src.slice(from, parts.arg.to - 1) === text ? bytesSpan(text.length, from) : standsFor(text.length, from, parts.arg.to - 1);
	return im.core.texts(text, [...marks, { type: 'code' }], spans);
}
