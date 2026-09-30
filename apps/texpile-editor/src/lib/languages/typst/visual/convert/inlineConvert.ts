// CST helpers and the inline walker: text, marks, links, shorthands, inline math
import type { SyntaxNode } from '@lezer/common';
import { buildNode, textNodes, collapseTextNodes, realMarks, type PmNode, type PmMark } from './builders';
import { typstMathToLatex } from './mathTranslate';
import { alignedSpans, bytesSpan, noteSpans, spansOf, standsFor } from '$lib/editor/visual/sourceSpans';
import { refCallParts, refMarkupParts } from './refConvert';
import { spelledAs } from '../serialize/refSource';

export function children(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

export function childOf(node: SyntaxNode, name: string): SyntaxNode | null {
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
	return null;
}

// code expressions that configure the document or bind names: typst wants them terminated by a
// line end or a semicolon, so they are always their own raw block
export const DECLARATION_KINDS = new Set(['ModuleImport', 'ModuleInclude', 'LetBinding', 'SetRule', 'ShowRule']);

// code expressions that produce content: a raw block when alone in their paragraph, an inline
// chip when prose surrounds them (`It is #if x [a] else [b] today.`)
export const EXPRESSION_KINDS = new Set(['Conditional', 'ForLoop', 'WhileLoop', 'Contextual', 'CodeBlock']);

export const STATEMENT_KINDS = new Set([...DECLARATION_KINDS, ...EXPRESSION_KINDS]);

export function expressionEnd(nodes: SyntaxNode[], at: number, src: string): number {
	const after = nodes[at + 1];
	if (after?.name === 'Semicolon' || (after?.name === 'Error' && after.to > after.from)) return at + 1;
	const spaced = after?.name === 'Space' && !/[\r\n]/.test(src.slice(after.from, after.to));
	return spaced && DECLARATION_KINDS.has(nodes[at].name) && nodes[at + 2]?.name === 'Semicolon' ? at + 2 : at;
}

// shorthands become the character the reader sees; the reverse direction needs no mapping
// because the character itself is valid Typst text
export const SHORTHANDS: Record<string, string> = {
	'--': '\u2013',
	'---': '\u2014',
	'...': '\u2026',
	'~': '\u00a0',
	'-?': '\u00ad'
};

/** `\*` reveals `*`; `\u{263A}` reveals the code point. Unknown forms stay verbatim. */
export function unescape(slice: string): string {
	const u = /^\\u\{([0-9a-fA-F]+)\}$/.exec(slice);
	if (u) {
		try {
			return String.fromCodePoint(parseInt(u[1], 16));
		} catch {
			return slice;
		}
	}
	return slice.length >= 2 && slice[0] === '\\' ? slice.slice(1) : slice;
}

export function withMarks(node: PmNode, marks: PmMark[]): PmNode {
	return marks.length > 0 ? noteSpans(node.mark(realMarks(marks)), spansOf(node)) : node;
}

/** an inline raw-source chip, the escape hatch every unknown inline construct falls into; `from` is where its text starts in the source */
export function chip(text: string, marks: PmMark[], from?: number): PmNode[] {
	const spans = from === undefined ? null : bytesSpan(text.length, from);
	return text ? [withMarks(buildNode('inline_latex', { lang: 'typst' }, textNodes(text, null, spans)), marks)] : [];
}

export function rawBlock(text: string, from?: number): PmNode {
	return buildNode('raw_latex', { lang: 'typst' }, textNodes(text, null, from === undefined ? null : bytesSpan(text.length, from)));
}

/** the source between an Equation's dollar delimiters, exactly as written. */
export function equationInner(eq: SyntaxNode, src: string): string {
	const ds = children(eq).filter((c) => c.name === 'Dollar');
	if (ds.length >= 2) return src.slice(ds[0].to, ds[ds.length - 1].from);
	return src.slice(eq.from, eq.to).replace(/^\$|\$$/g, '');
}

const STR_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

/** typst string literal -> its value, the inverse of typStr. unknown escapes stay verbatim. */
export function unquote(str: string): string {
	const inner = str.startsWith('"') && str.endsWith('"') && str.length >= 2 ? str.slice(1, -1) : str;
	return inner.replace(/\\u\{([0-9a-fA-F]+)\}|\\(.)/gs, (whole, hex: string | undefined, ch: string | undefined) => {
		if (hex != null) {
			try {
				return String.fromCodePoint(parseInt(hex, 16));
			} catch {
				return whole;
			}
		}
		return ch != null && ch in STR_ESCAPES ? STR_ESCAPES[ch] : whole;
	});
}

/** the one positional argument of `name(...)`, plus the content block, when the call has that
 *  exact shape and nothing else. */
function singleArgCall(call: SyntaxNode, src: string, name: string): { arg: SyntaxNode; content: SyntaxNode | null } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== name) return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !['LeftParen', 'RightParen', 'Comma', 'Space'].includes(k.name));
	if (real.length < 1 || real.length > 2) return null;
	const content = real[1] ?? null;
	if (content && content.name !== 'ContentBlock') return null;
	return { arg: real[0], content };
}

/** `#raw("...")`: the function form of an inline raw, used when the text holds a backtick. */
export function rawCallText(call: SyntaxNode, src: string): string | null {
	const parts = singleArgCall(call, src, 'raw');
	if (!parts || parts.content || parts.arg.name !== 'Str') return null;
	return unquote(src.slice(parts.arg.from, parts.arg.to));
}

/** `#link("https://...")` with no body, which the serializer writes for a bare url that the text
 *  after it would otherwise extend: the url chip a bare url is, standing for the call's bytes */
export function bareLinkHref(call: SyntaxNode, src: string): string | null {
	const parts = singleArgCall(call, src, 'link');
	if (!parts || parts.content || parts.arg.name !== 'Str') return null;
	const href = unquote(src.slice(parts.arg.from, parts.arg.to));
	return /^https?:\/\/\S+$/.test(href) ? href : null;
}

/** `#link("...")[...]` and nothing fancier; any other shape stays a chip. */
export function linkParts(call: SyntaxNode, src: string): { href: string; markup: SyntaxNode } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'link') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !['LeftParen', 'RightParen', 'Comma', 'Space'].includes(k.name));
	if (real.length !== 2 || real[0].name !== 'Str' || real[1].name !== 'ContentBlock') return null;
	const markup = childOf(real[1], 'Markup');
	if (!markup) return null;
	return { href: unquote(src.slice(real[0].from, real[0].to)), markup };
}

/** typst named colors that CSS can also render - the mark's DOM styling uses the value directly.
 *  `eastern` exists in typst but not CSS, so it stays a chip. */
const COLOR_IDENTS = new Set([
	'black',
	'gray',
	'silver',
	'white',
	'navy',
	'blue',
	'aqua',
	'teal',
	'purple',
	'fuchsia',
	'maroon',
	'red',
	'orange',
	'yellow',
	'olive',
	'green',
	'lime'
]);

export const CALL_PUNCT = ['LeftParen', 'RightParen', 'Comma', 'Space'];

/** `rgb("#hex")` or a shared named color -> its CSS-compatible value; anything else null. */
function colorValue(node: SyntaxNode, src: string): string | null {
	if (node.name === 'Ident') {
		const v = src.slice(node.from, node.to);
		return COLOR_IDENTS.has(v) ? v : null;
	}
	if (node.name === 'FuncCall') {
		const id = node.firstChild;
		if (!id || id.name !== 'Ident' || src.slice(id.from, id.to) !== 'rgb') return null;
		const args = id.nextSibling;
		if (!args || args.name !== 'Args') return null;
		const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
		if (real.length !== 1 || real[0].name !== 'Str') return null;
		const v = unquote(src.slice(real[0].from, real[0].to)).toLowerCase();
		return /^#[0-9a-f]{3,8}$/.test(v) ? v : null;
	}
	return null;
}

/** the color of a `fill: <color>` named argument, or null for any other named arg. */
function fillColor(named: SyntaxNode, src: string): string | null {
	const kids = children(named).filter((k) => k.name !== 'Colon' && k.name !== 'Space');
	if (kids.length !== 2 || kids[0].name !== 'Ident' || src.slice(kids[0].from, kids[0].to) !== 'fill') return null;
	return colorValue(kids[1], src);
}

// emph/strong: the function forms the serializer writes for an intraword mark (`un#strong[happy]ness`)
const MARK_FUNCS: Record<string, 'u' | 'sup' | 'sub' | 'em' | 'strong'> = {
	underline: 'u',
	super: 'sup',
	sub: 'sub',
	emph: 'em',
	strong: 'strong'
};

/** `#underline[..] / #super[..] / #sub[..] / #highlight[..] / #highlight(fill: c)[..] /
 *  #text(fill: c)[..]` -> a mark over the inline content. Any other shape (extra arguments,
 *  unshared color) stays a chip, the same rule links follow. */
export function markCallParts(call: SyntaxNode, src: string): { mark: PmMark; markup: SyntaxNode } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident') return null;
	const name = src.slice(ident.from, ident.to);
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
	function contentMarkup(n: SyntaxNode | undefined) {
		return n && n.name === 'ContentBlock' ? childOf(n, 'Markup') : null;
	}

	const plain = MARK_FUNCS[name];
	if (plain) {
		if (real.length !== 1) return null;
		const markup = contentMarkup(real[0]);
		return markup ? { mark: { type: plain }, markup } : null;
	}
	if (name === 'highlight') {
		if (real.length === 1) {
			const markup = contentMarkup(real[0]);
			return markup ? { mark: { type: 'highlight', attrs: { color: 'yellow' } }, markup } : null;
		}
		if (real.length === 2 && real[0].name === 'Named') {
			const color = fillColor(real[0], src);
			const markup = contentMarkup(real[1]);
			return color && markup ? { mark: { type: 'highlight', attrs: { color } }, markup } : null;
		}
		return null;
	}
	if (name === 'text' && real.length === 2 && real[0].name === 'Named') {
		const color = fillColor(real[0], src);
		const markup = contentMarkup(real[1]);
		return color && markup ? { mark: { type: 'textcolor', attrs: { color } }, markup } : null;
	}
	return null;
}

/** inline CST nodes -> inline PM nodes. Pairs each Hash with the expression following it. */
export function convertInline(nodes: SyntaxNode[], src: string, marks: PmMark[]): PmNode[] {
	const out: PmNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const k = nodes[i];
		const slice = src.slice(k.from, k.to);
		switch (k.name) {
			case 'Text':
				out.push(...textNodes(slice, marks, bytesSpan(slice.length, k.from)));
				break;
			case 'Space':
			case 'Parbreak': // only reachable in odd nests; a wrap is semantically a space
				out.push(...textNodes(' ', marks, standsFor(1, k.from, k.to)));
				break;
			case 'Strong':
			case 'Emph': {
				const markup = childOf(k, 'Markup');
				if (markup) {
					out.push(...convertInline(children(markup), src, [...marks, { type: k.name === 'Strong' ? 'strong' : 'em' }]));
				} else {
					out.push(...chip(slice, marks, k.from));
				}
				break;
			}
			case 'Raw': {
				const delims = children(k).filter((c) => c.name === 'RawDelim');
				if (delims.length < 2 || delims[0].to - delims[0].from >= 3) {
					// unterminated, or a block fence stuck mid-line: keep it literal
					out.push(...chip(slice, marks, k.from));
				} else {
					const inner = src.slice(delims[0].to, delims[delims.length - 1].from);
					out.push(...textNodes(inner, [...marks, { type: 'code' }], bytesSpan(inner.length, delims[0].to)));
				}
				break;
			}
			case 'Linebreak': {
				out.push(noteSpans(buildNode('hard_break', { lineBreak: true }), standsFor(1, k.from, k.to)));
				// the newline ending the broken line is part of the break, not a leading space
				// on the continuation; a same-line space after `\` is real text
				const sp = nodes[i + 1];
				if (sp?.name === 'Space') {
					i++;
					if (!/[\r\n]/.test(src.slice(sp.from, sp.to))) out.push(...textNodes(' ', marks, standsFor(1, sp.from, sp.to)));
				}
				break;
			}
			case 'Escape':
				out.push(...textNodes(unescape(slice), marks, alignedSpans(unescape(slice), k.from, slice)));
				break;
			case 'SmartQuote':
				out.push(...textNodes(slice, marks, bytesSpan(slice.length, k.from)));
				break;
			case 'Shorthand':
				out.push(...textNodes(SHORTHANDS[slice] ?? slice, marks, alignedSpans(SHORTHANDS[slice] ?? slice, k.from, slice)));
				break;
			case 'Hash': {
				const next = nodes[i + 1];
				if (!next) {
					out.push(...chip('#', marks, k.from));
					break;
				}
				const link = linkParts(next, src);
				const markCall = link ? null : markCallParts(next, src);
				// `#ref(<target>)` is also what the serializer writes where the next character would extend `@target`
				const refCall = link || markCall ? null : refCallParts(next, src);
				const rawText = link || markCall || refCall ? null : rawCallText(next, src);
				const bareHref = link || markCall || refCall || rawText != null ? null : bareLinkHref(next, src);
				if (bareHref != null) {
					out.push(
						withMarks(
							noteSpans(buildNode('inline_latex', { lang: 'typst' }, textNodes(bareHref)), standsFor(bareHref.length, k.from, next.to)),
							marks
						)
					);
				} else if (link) {
					const linkMark: PmMark = { type: 'link', attrs: { href: link.href, title: null, bare: false } };
					out.push(...convertInline(children(link.markup), src, [...marks, linkMark]));
				} else if (markCall) {
					out.push(...convertInline(children(markCall.markup), src, [...marks, markCall.mark]));
				} else if (refCall) {
					const ref = withMarks(noteSpans(buildNode('typ_ref', refCall), standsFor(1, k.from, next.to)), marks);
					out.push(spelledAs(ref, src.slice(k.from, next.to)));
				} else if (rawText != null) {
					out.push(...textNodes(rawText, [...marks, { type: 'code' }], standsFor(rawText.length, k.from, next.to)));
				} else {
					// a terminating semicolon belongs to the expression (`#a; text`)
					const end = expressionEnd(nodes, i + 1, src);
					out.push(...chip(src.slice(k.from, nodes[end].to), marks, k.from));
					i = end - 1;
				}
				i++;
				break;
			}
			case 'Equation': {
				// fully-translatable equations become MathLive-editable math nodes carrying their
				// original typst; anything the translator can't prove stays a raw chip
				const inner = equationInner(k, src);
				const latex = typstMathToLatex(inner);
				if (latex != null) {
					// the formula stands for its bytes whole: its content is a translation, not the source
					out.push(
						withMarks(
							noteSpans(buildNode('inline_math', { typst: inner, latexOrig: latex }, textNodes(latex)), standsFor(1, k.from, k.to)),
							marks
						)
					);
				} else {
					out.push(...chip(slice, marks, k.from));
				}
				break;
			}
			case 'Ref': {
				// @target becomes the ref/citation atom, a supplement (`@fig[Figure]`) riding along verbatim
				const ref = refMarkupParts(k, src);
				if (ref) {
					out.push(spelledAs(withMarks(noteSpans(buildNode('typ_ref', ref), standsFor(1, k.from, k.to)), marks), slice));
				} else {
					out.push(...chip(slice, marks, k.from));
				}
				break;
			}
			// labels, equations, comments and anything unforeseen: verbatim chips
			default:
				out.push(...chip(slice, marks, k.from));
		}
	}
	return collapseTextNodes(out);
}

/** one source construct -> its PM blocks, with the span the slice is cut from. */
