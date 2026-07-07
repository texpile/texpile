// unified-latex AST to ProseMirror Nodes.
import type { Node, Root, Macro, Environment } from '@unified-latex/unified-latex-types';
import { getTextContent, getMacroFirstArg, isMathEnvironment, type RawStamped } from './ast-utils';
// don't use toString from unified-latex-util-to-string: it uses Prettier, which is async in v3
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { parseLatex } from './parser';
import type { ParseOptions } from './types';
import { listNewcommands } from '@unified-latex/unified-latex-util-macros';
import { attachMacroArgs } from '@unified-latex/unified-latex-util-arguments';
import { schema } from '$lib/schema/schema';
import {
	el,
	txt,
	txtNodes,
	nodeToLatexString,
	createDefaultContext,
	collapseTextNodes,
	realMarks,
	type PMNode,
	type PMMark,
	type ConversionContext,
	type ConversionOptions
} from './builders';

import { ignoredMacros, SCOPED_SWITCHES, FONT_SIZE_SWITCHES, MACRO_SIGNATURES, ENV_SIGNATURES, stripSamelineComments } from './macros';
import {
	heuristicMarkCommentedMacroCalls,
	heuristicMarkTeXPrimitiveDefs,
	heuristicMarkDelimitedMacroSpans,
	heuristicInferUnknownMacroSignatures
} from './heuristics';

export type { PMNode, PMMark, ConversionOptions };

// verbatim source capture (the `orig` attr, see ORIG_BLOCKS in schema.ts): the TOP-LEVEL
// convertNodesToBlocks pass stamps every block with `orig: { latex, pre, seq, norm: null,
// group? }`. parseLatexFile later fills `norm`; the serializer re-emits `latex` only while the
// block still serializes to `norm`. armed by latexToProseMirror, consumed (grab-and-null) by the
// first convertNodesToBlocks call, so recursive calls never capture.

interface CaptureState {
	/** The exact source string the AST positions index into. */
	source: string;
	/** Next top-level block index. EVERY pushed block gets a seq, even span-less ones, so the
	 *  serializer can tell pristine neighbours from a deletion (re-joining across a deletion
	 *  with `pre` would resurrect the deleted source). */
	seq: number;
	/** End offset of the previous block's span (start of the current inter-block gap). */
	prevEnd: number;
	/** Next group id for one-source-construct to many-blocks results. */
	group: number;
}
let pendingCapture: CaptureState | null = null;
// stashed by the top-level convertNodesToBlocks right before it returns so latexToProseMirror
// can read the final prevEnd/seq for the body's trailing gap. grab-and-null, like pendingCapture.
let lastCapResult: CaptureState | null = null;

/** Walk `n`'s position (+ content/args) into `acc`, REJECTING any start before `floor`: never a
 *  legitimate undershoot, always a synthetic/corrupt offset (math script groups have no real
 *  position; a missing `.offset` reads back as 0, which a naive `<` would accept and drag the
 *  span to the file start). `floor` is always cap.prevEnd. */
function extendExtent(n: unknown, acc: { min: number; max: number }, floor: number): void {
	if (!n || typeof n !== 'object') return;
	const node = n as { position?: { start?: { offset?: number }; end?: { offset?: number } }; content?: unknown; args?: unknown[] };
	const p = node.position;
	if (p) {
		if (typeof p.start?.offset === 'number' && p.start.offset >= floor && p.start.offset < acc.min) acc.min = p.start.offset;
		if (typeof p.end?.offset === 'number' && p.end.offset > acc.max) acc.max = p.end.offset;
	}
	if (Array.isArray(node.content)) for (const c of node.content) extendExtent(c, acc, floor);
	if (Array.isArray(node.args)) for (const a of node.args) extendExtent(a, acc, floor);
}

/** Min/max source offsets across node + content + attached args. recursing matters:
 *  attachMacroArgs can leave the macro's own position covering only the control sequence while
 *  the moved args carry their own, so extending past the node's own end is intentional. the
 *  node's OWN start, when >= floor, is additionally authoritative for the lower bound. */
function nodeExtent(node: Node, floor = 0): { min: number; max: number } | null {
	const acc = { min: Infinity, max: -Infinity };
	extendExtent(node, acc, floor);
	if (acc.min > acc.max) return null;
	const top = (node as unknown as { position?: { start?: { offset?: number } } }).position;
	if (typeof top?.start?.offset === 'number' && top.start.offset >= floor && acc.min < top.start.offset) acc.min = top.start.offset;
	return acc;
}

/** Recreate `node` with an `orig` attr. Types that don't declare `orig` are returned as-is
 *  (fail-safe: such a block simply always regenerates). */
function withOrig(node: PMNode, orig: Record<string, unknown>): PMNode {
	if (!node.type.spec.attrs || !('orig' in node.type.spec.attrs)) return node;
	return node.type.create({ ...node.attrs, orig }, node.content, node.marks);
}

// byte-faithful raw fallback: raw preservation slices the ORIGINAL bytes via source offsets
// instead of printRaw. printRaw emits a blank line after own-line comments, and a blank line IS
// a \par token: fatal "Runaway argument" inside a non-\long arg (\author, \institute), a silent
// paragraph break in prose. printRaw stays the fallback for nodes without a trustworthy span
// (synthesized nodes, the slotified figureTemplate tree).
let rawSliceSource: string | null = null;

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
function repairArgTail(node: Node, src: string, endIn: number): number | null {
	const args = (node as Macro).args as { openMark: string; closeMark: string; content: Node[] }[] | undefined;
	if (!args || args.length === 0) return endIn;
	let last = -1;
	for (let k = args.length - 1; k >= 0; k--) {
		const acc = { min: Infinity, max: -Infinity };
		for (const c of args[k].content) extendExtent(c, acc, 0);
		if (Number.isFinite(acc.max) && acc.max > 0) {
			last = k;
			break;
		}
	}
	const expectTail: string[] = [];
	if (last >= 0 && args[last].closeMark) expectTail.push(args[last].closeMark);
	for (let k = last + 1; k < args.length; k++) {
		if (args[k].openMark) expectTail.push(args[k].openMark);
		if (args[k].closeMark) expectTail.push(args[k].closeMark);
	}
	let end = endIn;
	for (const ch of expectTail) {
		// lexical whitespace skip; which closers to expect came from the AST args above
		while (end < src.length && /[ \t\r\n]/.test(src[end])) end++;
		if (src[end] !== ch) return null;
		end++;
	}
	return end;
}

/** The node's exact original source slice, or null when no trustworthy span exists. */
function nodeRawSource(node: Node): string | null {
	if (!rawSliceSource) return null;
	const ext = nodeExtent(node);
	if (!ext || !Number.isFinite(ext.min) || ext.min < 0 || ext.max > rawSliceSource.length || ext.min >= ext.max) return null;

	let end: number | null = ext.max;
	const hasArgs = !!(node as Macro).args?.length;
	if (hasArgs) {
		end = repairArgTail(node, rawSliceSource, ext.max);
		// the repair can be unnecessary (positions already covered the closers); accept the raw
		// extent instead iff it is brace-balanced on its own.
		if (end == null && braceDebt(rawSliceSource.slice(ext.min, ext.max)) === 0) end = ext.max;
		if (end == null) return null;
	}
	if (end > rawSliceSource.length) return null;

	const slice = rawSliceSource.slice(ext.min, end);
	// every construct sliced here starts with \ or {, and a faithful slice must be
	// brace-balanced: refuse corrupt extents that landed mid-prose.
	if (!/^[\\{]/.test(slice) || braceDebt(slice) !== 0) return null;
	return slice;
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
function mathBodyRawSource(node: Node, opens: string[], closes: string[]): string | null {
	if (!rawSliceSource) return null;
	const src = rawSliceSource;
	const pos = (node as { position?: { start?: { offset?: number }; end?: { offset?: number } } }).position;
	const start = pos?.start?.offset;
	const end = pos?.end?.offset;
	if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end > src.length || start >= end) return null;
	const open = opens.find((o) => src.startsWith(o, start));
	const close = closes.find((c) => end - c.length >= start && src.startsWith(c, end - c.length));
	if (!open || !close || start + open.length > end - close.length) return null;
	const slice = src.slice(start + open.length, end - close.length);
	return braceDebt(slice) === 0 ? slice : null;
}

/**
 * Extend ext.max over a macro's attached-arg tail when the source confirms it (repairArgTail).
 * used by the orig block capture: a block ending inside an attached argument otherwise gets a
 * truncated orig.latex, and the missing closer lands in the inter-block gap, silently lost
 * whenever the next block has no verbatim slice to re-join `pre` across.
 */
function repairExtentTail(node: Node, ext: { min: number; max: number } | null): { min: number; max: number } | null {
	if (!ext || !rawSliceSource || !Number.isFinite(ext.max)) return ext;
	if (!(node as Macro).args?.length) return ext;
	const end = repairArgTail(node, rawSliceSource, ext.max);
	return end != null && end > ext.max ? { min: ext.min, max: end } : ext;
}

type MacroHandler = (macro: Macro, ctx: ConversionContext) => PMNode[] | null;

const macroHandlers: Record<string, MacroHandler> = {
	textbf: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'strong' }] };
		return convertNodesToInline(content, newCtx);
	},
	textit: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'em' }] };
		return convertNodesToInline(content, newCtx);
	},
	emph: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'em' }] };
		return convertNodesToInline(content, newCtx);
	},
	underline: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'u' }] };
		return convertNodesToInline(content, newCtx);
	},
	texttt: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'code' }] };
		return convertNodesToInline(content, newCtx);
	},
	textsuperscript: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'sup' }] };
		return convertNodesToInline(content, newCtx);
	},
	// command-form \abstract{...}: wrap the inline content in one paragraph (the abstract node's
	// schema wants block+), stamp sourceForm:'macro' so it round-trips as the command form.
	abstract: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const inline = convertNodesToInline(content, ctx);
		return [el('abstract', { sourceForm: 'macro' }, [el('paragraph', null, inline)])];
	},
	textsubscript: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'sub' }] };
		return convertNodesToInline(content, newCtx);
	},
	verb: (macro) => {
		const content = getTextContent(getMacroFirstArg(macro));
		return txtNodes(content, [{ type: 'code' }]);
	},

	textcolor: (macro, ctx) => {
		if (!macro.args || macro.args.length < 2) return null;
		const mandatoryArgs = macro.args.filter((arg) => arg.openMark === '{');
		if (mandatoryArgs.length < 2) return null;
		const color = getTextContent(mandatoryArgs[0].content);
		const content = mandatoryArgs[1].content;
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'textcolor', attrs: { color } }] };
		return convertNodesToInline(content, newCtx);
	},
	colorbox: (macro, ctx) => {
		if (!macro.args || macro.args.length < 2) return null;
		const mandatoryArgs = macro.args.filter((arg) => arg.openMark === '{');
		if (mandatoryArgs.length < 2) return null;
		const color = getTextContent(mandatoryArgs[0].content);
		const content = mandatoryArgs[1].content;
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'highlight', attrs: { color } }] };
		return convertNodesToInline(content, newCtx);
	},

	url: (macro, ctx) => {
		const href = getTextContent(getMacroFirstArg(macro));
		// bare: true, see the attr's doc comment in schema.ts / applyMarks in latexSerializer.ts.
		return txtNodes(href, [...ctx.marks, { type: 'link', attrs: { href, title: null, bare: true } }]);
	},
	href: (macro, ctx) => {
		const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
		const href = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';
		const text = mandatoryArgs[1] ? getTextContent(mandatoryArgs[1].content) : href;
		return txtNodes(text, [...ctx.marks, { type: 'link', attrs: { href, title: null } }]);
	},

	section: (macro) => createHeading(macro, 1),
	subsection: (macro) => createHeading(macro, 2),
	subsubsection: (macro) => createHeading(macro, 3),
	paragraph: (macro) => createHeading(macro, 4),
	subparagraph: (macro) => createHeading(macro, 5),
	chapter: (macro) => createHeading(macro, 1),
	part: (macro) => createHeading(macro, 1),

	// special characters all pass ctx.marks through: they're ordinary inline content, often
	// inside \textbf{...} (\textbf{90.1\%}); without this the enclosing mark silently dropped
	// for exactly that token.
	LaTeX: (_m, ctx) => txtNodes('LaTeX', ctx.marks.length > 0 ? ctx.marks : null),
	TeX: (_m, ctx) => txtNodes('TeX', ctx.marks.length > 0 ? ctx.marks : null),
	'\\': () => [el('hard_break', { lineBreak: true })], // serializes back to \\
	newline: () => [el('hard_break', { lineBreak: true })],
	'%': (_m, ctx) => txtNodes('%', ctx.marks.length > 0 ? ctx.marks : null),
	'&': (_m, ctx) => txtNodes('&', ctx.marks.length > 0 ? ctx.marks : null),
	$: (_m, ctx) => txtNodes('$', ctx.marks.length > 0 ? ctx.marks : null),
	'#': (_m, ctx) => txtNodes('#', ctx.marks.length > 0 ? ctx.marks : null),
	_: (_m, ctx) => txtNodes('_', ctx.marks.length > 0 ? ctx.marks : null),
	'{': (_m, ctx) => txtNodes('{', ctx.marks.length > 0 ? ctx.marks : null),
	'}': (_m, ctx) => txtNodes('}', ctx.marks.length > 0 ? ctx.marks : null),
	textbackslash: (_m, ctx) => txtNodes('\\', ctx.marks.length > 0 ? ctx.marks : null),
	'~': (_m, ctx) => txtNodes('\u00A0', ctx.marks.length > 0 ? ctx.marks : null),
	ldots: (_m, ctx) => txtNodes('…', ctx.marks.length > 0 ? ctx.marks : null),
	dots: (_m, ctx) => txtNodes('…', ctx.marks.length > 0 ? ctx.marks : null),
	textendash: (_m, ctx) => txtNodes('–', ctx.marks.length > 0 ? ctx.marks : null),
	textemdash: (_m, ctx) => txtNodes('—', ctx.marks.length > 0 ? ctx.marks : null),

	quad: (_m, ctx) => txtNodes('  ', ctx.marks.length > 0 ? ctx.marks : null),
	qquad: (_m, ctx) => txtNodes('    ', ctx.marks.length > 0 ? ctx.marks : null),
	',': (_m, ctx) => txtNodes(' ', ctx.marks.length > 0 ? ctx.marks : null), // thin space
	';': (_m, ctx) => txtNodes(' ', ctx.marks.length > 0 ? ctx.marks : null), // medium space
	':': (_m, ctx) => txtNodes(' ', ctx.marks.length > 0 ? ctx.marks : null), // thick space
	'!': () => null, // negative thin space
	// spacing commands (\vspace, \hspace, \vfill, ...) are deliberately NOT handled here: they
	// affect layout, so they fall through to raw inline_latex and round-trip verbatim.
	indent: () => null, // a leading indent the editor models implicitly; no visible token

	// size/series/shape switches are NOT dropped either: they fall through to raw, and a {...}
	// group scoping one is kept whole (see SCOPED_SWITCHES / the 'group' case).

	defbibheading: () => null,
	addbibresource: () => null,

	// NB: no `label` handler: table_wrapper/figure/block_math capture their own labels; any other
	// \label falls through to raw so it's preserved (a dropped label silently breaks \ref/\cref).
	def: () => null, // \def\x{...} has no safe arg signature yet, leave for a follow-up
	let: () => null,
	ifdefempty: () => null,

	// \par flushes the current paragraph (null signals it)
	par: () => null,

	hrule: () => [el('horizontal_rule')],
	// \rule{\linewidth}{0.4pt} is exactly what our horizontal_rule emits, so map it back. any
	// other \rule is a sized box/strut (e.g. row-height struts): preserve verbatim rather than
	// collapse to a generic full-width line (which also compounded).
	rule: (macro) => {
		const dims = (macro.args ?? []).filter((a) => a.openMark === '{').map((a) => printRaw(a.content).trim());
		if (dims.length === 2 && dims[0] === '\\linewidth' && dims[1] === '0.4pt') return [el('horizontal_rule')];
		// strip a swallowed trailing \par; (?![a-zA-Z]) is TeX's control-word terminator, so
		// \paragraph can never false-match.
		const rawLatex = printRaw(macro).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
		return [el('inline_latex', null, [txt(rawLatex)])];
	},

	// the original command is carried through (createCitation reads macro.content) so
	// \citep/\citet/... round-trip instead of collapsing to \autocite.
	cite: (macro) => createCitation(macro),
	citep: (macro) => createCitation(macro),
	citet: (macro) => createCitation(macro),
	parencite: (macro) => createCitation(macro),
	textcite: (macro) => createCitation(macro),
	autocite: (macro) => createCitation(macro),
	footcite: (macro) => createCitation(macro),

	ref: (macro) => createRef(macro, null),
	eqref: (macro) => createRef(macro, 'equation'),
	pageref: (macro) => createRef(macro, 'page'),
	autoref: (macro) => createRef(macro, null),
	cref: (macro) => createRef(macro, null),
	Cref: (macro) => createRef(macro, null),

	// every \vspace round-trips verbatim as a raw chip, including \vspace{\baselineskip} (no
	// longer the editor's blank-line protocol; one someone typed is real spacing).
	vspace: (macro) => {
		// lexical trailing-\par strip, same as the `rule` handler
		const rawLatex = printRaw(macro).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
		return [el('inline_latex', null, [txt(rawLatex)])];
	},

	// \input/\include/\subfile: a clickable chip; path kept verbatim, `command` records which
	// form was used so it serializes back exactly.
	input: (macro) => createIncludeDoc(macro),
	include: (macro) => createIncludeDoc(macro),
	subfile: (macro) => createIncludeDoc(macro),

	// KNOWN GAP: the filename is flattened via getTextContent, so a nested macro call
	// (\includegraphics{\iftoggle{hq}{a.pdf}{b.pdf}}) loses its structure and concatenates into
	// one bogus path. fixing it needs a raw-source fallback here; deliberately out of scope (rare).
	includegraphics: (macro) => {
		if (!macro.args || macro.args.length === 0) return null;
		let src = '';
		for (let i = macro.args.length - 1; i >= 0; i--) {
			const arg = macro.args[i];
			if (arg.openMark === '{' && arg.closeMark === '}') {
				src = getTextContent(arg.content);
				break;
			}
		}
		if (!src && macro.args.length > 0) {
			src = getTextContent(macro.args[macro.args.length - 1].content);
		}
		// preserve the verbatim optional args so the image keeps its exact size/crop.
		const optArg = macro.args.find((a) => a.openMark === '[');
		// '' (not null) records "the source had no [..]" so the serializer emits bracket-free;
		// null is reserved for editor-created images (which want the default width).
		const options = optArg ? printRaw(optArg.content) : '';
		// bareOriginal: this handler only runs for a STANDALONE \includegraphics (figures go via
		// createFigureWrapper), so regeneration must not synthesize a figure wrapper. see schema.ts.
		return [el('image', { src, alt: null, title: null, label: null, options, bareOriginal: true })];
	}

	// \footnote is NOT inlined as "[text]": that reflows the document and drops the real
	// page-bottom footnote. it falls through to raw and round-trips whole.

	// \title/\author/\date/\maketitle fall through to raw whole (with \thanks and the \And
	// grid): dropping them made \maketitle rebuild a wrong-height block, shifting the page.
};

/** True if a macro carries a star argument (e.g. `\section*`), parsed via the `s` signature. */
function macroHasStar(macro: Macro): boolean {
	return (macro.args ?? []).some(
		(arg) => arg.content?.length === 1 && arg.content[0]?.type === 'string' && (arg.content[0] as { content?: string }).content === '*'
	);
}

function createHeading(macro: Macro, level: number): PMNode[] {
	const content = getMacroFirstArg(macro);
	const textNodes = convertNodesToInline(content, createDefaultContext());
	// starred sectioning commands (\section*) are unnumbered
	const numbered = !macroHasStar(macro);
	return [el('heading', { level, numbered }, textNodes)];
}

function createIncludeDoc(macro: Macro): PMNode[] | null {
	// keep the path exactly as written (LaTeX resolves the .tex extension itself)
	const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
	const path = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content).trim() : '';
	if (!path) return null; // no argument captured: let it fall through to raw
	const command = typeof macro.content === 'string' && macro.content ? macro.content : 'input';
	return [el('includedoc', { path, command })];
}

function createCitation(macro: Macro): PMNode[] {
	const optionalArgs = macro.args?.filter((arg) => arg.openMark === '[') || [];
	const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];

	const key = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';

	// [pre-note][post-note], or just [post-note]
	let prenote = '';
	let postnote = '';
	if (optionalArgs.length === 2) {
		prenote = getTextContent(optionalArgs[0].content) || '';
		postnote = getTextContent(optionalArgs[1].content) || '';
	} else if (optionalArgs.length === 1) {
		postnote = getTextContent(optionalArgs[0].content) || '';
	}

	// keep the original command so \citep{x} doesn't come back as \autocite{x}
	const variant = typeof macro.content === 'string' && macro.content ? macro.content : 'autocite';
	return [el('citation', { variant, prenote, postnote }, key ? [txt(key)] : null)];
}

type EnvHandler = (env: Environment, ctx: ConversionContext, options: ConversionOptions) => PMNode[];

function createRef(macro: Macro, refType: string | null): PMNode[] {
	const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
	const label = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';

	// infer refType from the label prefix if not provided
	if (!refType && label) {
		const lowerLabel = label.toLowerCase();
		if (lowerLabel.startsWith('tab:') || lowerLabel.startsWith('table:') || lowerLabel.includes('texpile-table-')) {
			refType = 'table';
		} else if (lowerLabel.startsWith('fig:') || lowerLabel.startsWith('figure:') || lowerLabel.includes('texpile-fig-')) {
			refType = 'figure';
		} else if (lowerLabel.startsWith('eq:') || lowerLabel.startsWith('equation:') || lowerLabel.includes('texpile-eq-')) {
			refType = 'equation';
		}
	}

	// keep the original command (ref/eqref/cref/...) so it round-trips instead of normalising
	// to \autoref.
	const command = typeof macro.content === 'string' && macro.content ? macro.content : 'autoref';
	// unknown target kind: the general 'reference' type
	return [el('ref', { refType: refType ?? 'reference', command }, label ? [txt(label)] : null)];
}

// only `document` is truly transparent: center/flushleft/flushright change the rendered
// alignment, so they stay as `environment` nodes.
const transparentEnvironments = new Set(['document']);

/** verbatim/lstlisting/minted to one code_block, remembering the source env name + verbatim args
 * so the serializer reconstructs the SAME environment instead of a fixed one. */
function codeBlockFromVerbatimEnv(env: Environment): PMNode {
	// unified-latex stores verbatim-family bodies as a literal string on `content`, despite the
	// declared `content: Node[]` type.
	const rawContent = env.content as unknown as Node[] | string;
	const body = typeof rawContent === 'string' ? rawContent : printRaw(rawContent);
	const args = env.args && env.args.length ? printRaw(env.args) : '';
	return el('code_block', { lang: 'text', env: env.env, args }, [txt(body)]);
}

const envHandlers: Record<string, EnvHandler> = {
	document: (env, _ctx, options) => convertNodesToBlocks(env.content, options),
	itemize: (env, _ctx, options) => createList(env, 'bullet', options),
	enumerate: (env, _ctx, options) => createList(env, 'ordered', options),
	description: (env, _ctx, options) => createList(env, 'bullet', options),
	quote: (env, _ctx, options) => [el('blockquote', null, convertNodesToBlocks(env.content, options))],
	quotation: (env, _ctx, options) => [el('blockquote', null, convertNodesToBlocks(env.content, options))],
	// sourceForm:'env' so it round-trips to the env form (the command form stamps 'macro')
	abstract: (env, _ctx, options) => [el('abstract', { sourceForm: 'env' }, convertNodesToBlocks(env.content, options))],
	// losing lstlisting's [language=...] silently drops \lstset styling keyed off it
	verbatim: (env) => [codeBlockFromVerbatimEnv(env)],
	lstlisting: (env) => [codeBlockFromVerbatimEnv(env)],
	minted: (env) => [codeBlockFromVerbatimEnv(env)],
	figure: (env, ctx, options) => createFigureWrapper(env, ctx, options),
	// starred variants: nodeToLatexString(env) uses env.env itself, so the star round-trips via
	// the figureTemplate slot mechanism. without this, figure* fell to the generic env wrapper
	// and a lone \includegraphics inside got promoted to a template-less image that always
	// serializes as a bare \begin{figure}[h]: wrong env, invalid nesting, caption dropped.
	// invisible to byte round-trip checks (the orig layer masks it); only surfaces on regeneration.
	'figure*': (env, ctx, options) => createFigureWrapper(env, ctx, options),
	// wrapfig: same bug/fix as figure*; createFigureWrapper handles any env name verbatim.
	// wraptable is deliberately NOT routed here: table_wrapper has no verbatim template
	// (tableSerializer always synthesizes \begin{table}/table*), so it would destroy the
	// text-wrap layout instead of fixing anything.
	wrapfigure: (env, ctx, options) => createFigureWrapper(env, ctx, options),
	table: (env, ctx, options) => createTableWrapper(env, ctx, options),
	'table*': (env, ctx, options) => createTableWrapper(env, ctx, options),
	tabular: (env) => createTable(env),
	'tabular*': (env) => createTable(env),
	tabularx: (env) => createTable(env),
	// a longtable with repeating header/footer markers (\endhead etc.) is unmodelable as a grid:
	// createTable garbled the markers into cell text and leaked the colspec into the body.
	// demote those to raw; marker-less longtables keep the editable-table path.
	longtable: (env) => {
		const LT_MARKERS = new Set(['endfirsthead', 'endhead', 'endfoot', 'endlastfoot']);
		const hasMarkers = (env.content as Node[]).some((n) => n.type === 'macro' && LT_MARKERS.has((n as Macro).content));
		if (hasMarkers) return [el('raw_latex', null, [txt(nodeRawSource(env) ?? nodeToLatexString(env))])];
		return createTable(env);
	},
	equation: (env) => createBlockMath(env, false),
	'equation*': (env) => createBlockMath(env, true),
	align: (env) => createBlockMath(env, false, 'align'),
	'align*': (env) => createBlockMath(env, true, 'align'),
	alignat: (env) => createBlockMath(env, false, 'alignat'),
	'alignat*': (env) => createBlockMath(env, true, 'alignat'),
	// unregistered, flalign fell through to a bare \[...\], which drops the &-column syntax its
	// rows depend on: bare & outside an alignment env is a compile error ("Misplaced alignment tab").
	flalign: (env) => createBlockMath(env, false, 'flalign'),
	'flalign*': (env) => createBlockMath(env, true, 'flalign'),
	gather: (env) => createBlockMath(env, false, 'gather'),
	'gather*': (env) => createBlockMath(env, true, 'gather'),
	// multline/eqnarray must ALSO pass their env name: the serializer only re-inserts extracted
	// lineLabels when `environment` is set, otherwise blockMath's display-env early-return
	// re-emits the already label-stripped content and every \label (and \ref to it) vanishes.
	multline: (env) => createBlockMath(env, false, 'multline'),
	'multline*': (env) => createBlockMath(env, true, 'multline'),
	eqnarray: (env) => createBlockMath(env, false, 'eqnarray'),
	'eqnarray*': (env) => createBlockMath(env, true, 'eqnarray'),
	split: (env) => createBlockMath(env, true),
	cases: (env) => createBlockMath(env, true),
	displaymath: (env) => createBlockMath(env, true),
	math: (env) => createBlockMath(env, true)
	// minipage/center/flushleft/flushright are NOT handled here: they fall through to a preserved
	// environment node that carries its \begin args, so minipage keeps its {width}.
};

function extractTableComponents(content: Node[], ctx: ConversionContext) {
	let caption: PMNode | null = null;
	// collect ALL labels: the last stays primary (single-label case unchanged, and reference-
	// manager UI reads `label` as one bare id), earlier ones round-trip via extraLabels.
	// overwriting on each occurrence silently dropped every label but the last.
	const labels: string[] = [];
	const tables: PMNode[] = [];
	const notes: PMNode[] = [];

	// preNodes (setup like \setlength{\tabcolsep}{4pt} that must precede the tabular) round-trip
	// as a raw prefix (preBody); noteNodes (after the tabular) become editable table_notes.
	const preNodes: Node[] = [];
	let noteNodes: Node[] = [];
	let sawTabular = false;

	for (const node of content) {
		if (node.type === 'macro' && node.content === 'caption') {
			const arg = getMacroFirstArg(node as Macro);
			const captionText = convertNodesToInline(arg, ctx);
			caption = el('table_caption', null, captionText);
		} else if (node.type === 'macro' && node.content === 'label') {
			const text = getTextContent(getMacroFirstArg(node as Macro));
			if (text) labels.push(text);
		} else if (node.type === 'environment' && (node.env === 'tabular' || node.env === 'tabularx' || node.env === 'longtable')) {
			sawTabular = true;
			if (node.env === 'tabular') tables.push(...createTable(node as Environment));
			else if (node.env === 'tabularx') tables.push(...createTable(node as Environment));
			else if (node.env === 'longtable') tables.push(...createTable(node as Environment));
		} else {
			// whitespace BEFORE the tabular is just separation (preBody re-joins with spaces);
			// whitespace AFTER is preserved (word spacing in notes prose matters).
			if (node.type === 'parbreak' || (node.type === 'whitespace' && !sawTabular)) continue;
			if (node.type === 'macro' && (node.content === 'centering' || node.content === 'vspace' || node.content === 'raggedright')) continue;
			// the notes serializer emits its own {\small ...}, so a size switch in the NOTES
			// position is redundant and compounds each save: strip a bare one, unwrap a group led
			// by one. must stay scoped to sawTabular: a switch BEFORE the tabular (\scriptsize to
			// shrink an oversized table) has nothing to do with the notes wrapper and must survive.
			if (sawTabular && node.type === 'macro' && FONT_SIZE_SWITCHES.has((node as Macro).content)) continue;
			if (sawTabular && node.type === 'group') {
				const gcontent: Node[] = node.content || [];
				const firstMeaningful = gcontent.find((n) => !(n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'));
				if (firstMeaningful && firstMeaningful.type === 'macro' && FONT_SIZE_SWITCHES.has((firstMeaningful as Macro).content)) {
					noteNodes.push(...gcontent.filter((n) => n !== firstMeaningful));
					continue;
				}
			}

			(sawTabular ? noteNodes : preNodes).push(node);
		}
	}

	// preBody is plumbing, not prose the user edits: round-trip raw (byte-sliced when possible)
	const preBody =
		preNodes.length > 0
			? preNodes
					.map((n) => nodeRawSource(n) ?? printRaw(n))
					.join(' ')
					.trim() || null
			: null;

	// trim whitespace-only edges before deciding notes exist, or the near-universal newline
	// between \end{tabular} and \end{table} earns every table a spurious empty {\small } wrapper
	// (visible extra vertical space).
	while (noteNodes.length && noteNodes[0].type === 'whitespace') noteNodes.shift();
	while (noteNodes.length && noteNodes[noteNodes.length - 1].type === 'whitespace') noteNodes.pop();

	// a \vskip/\hskip or scoped switch after the tabular is setup, not prose, but the notes
	// wrapper emits \par\smallskip{\small ...} around whatever lands in noteNodes: extra vertical
	// space for a bare \vskip, and {\small \normalsize} literally re-shrinks the text that
	// command exists to un-shrink. round-trip it raw as postBody instead, scoped to when it
	// STARTS the post-tabular content; real notes after a leading switch keep the \small treatment.
	let postBody: string | null = null;
	const firstNote = noteNodes.find((n) => n.type !== 'whitespace' && n.type !== 'parbreak');
	if (
		firstNote &&
		firstNote.type === 'macro' &&
		((firstNote as Macro).content === 'vskip' ||
			(firstNote as Macro).content === 'hskip' ||
			SCOPED_SWITCHES.has((firstNote as Macro).content))
	) {
		postBody =
			noteNodes
				.map((n) => nodeRawSource(n) ?? printRaw(n))
				.join(' ')
				.trim() || null;
		noteNodes = [];
	}

	if (noteNodes.length > 0) {
		const convertedNotes = convertNodesToInline(noteNodes, ctx);
		if (convertedNotes.length > 0) {
			notes.push(el('table_notes', null, convertedNotes));
		}
	}

	const label = labels.length > 0 ? labels[labels.length - 1] : null;
	const extraLabels = labels.length > 1 ? labels.slice(0, -1) : null;

	return { caption, label, extraLabels, tables, notes, preBody, postBody };
}

/** Whether a tabular/tabularx/longtable appears anywhere (possibly nested) in these nodes. */
function containsTabular(nodes: Node[]): boolean {
	for (const n of nodes) {
		if (n.type === 'environment' && (n.env === 'tabular' || n.env === 'tabular*' || n.env === 'tabularx' || n.env === 'longtable'))
			return true;
		if ('content' in n && Array.isArray(n.content) && containsTabular(n.content)) return true;
	}
	return false;
}

function createTableWrapper(env: Environment, ctx: ConversionContext, options: ConversionOptions): PMNode[] {
	const { caption, label, extraLabels, tables, notes, preBody, postBody } = extractTableComponents(env.content, ctx);

	const tableNode = tables[0];
	if (!tableNode) {
		// no tabular as a DIRECT child. one merely nested (e.g. in \begin{center}) still becomes
		// editable: keep the float as an environment node, the nested tabular converts inside it.
		if (containsTabular(env.content)) {
			const envArgs = (env as Environment).args && (env as Environment).args!.length ? printRaw((env as Environment).args!) : '';
			const inner = convertNodesToBlocks(env.content, options);
			return [el('environment', { name: env.env, args: envArgs }, inner.length > 0 ? inner : [el('paragraph')])];
		}
		// genuinely unmodellable (tabulary, tabu, ...): block-parsing would inject an illegal
		// \par and mangle the column spec, so preserve the whole float verbatim.
		return [el('raw_latex', null, [txt(nodeRawSource(env) ?? nodeToLatexString(env))])];
	}

	// the float's own placement specifier ([t], [H], or '' when the source had none), round-
	// tripped verbatim: [H] FORCES placement while [h] is advisory, so silently downgrading one
	// to the other can move the table to a different page.
	const placement = env.args && env.args.length ? printRaw(env.args) : '';

	return [
		el(
			'table_wrapper',
			{
				label: label,
				extraLabels: extraLabels ? extraLabels.join('\n') : null,
				showNotes: notes.length > 0,
				preBody,
				postBody,
				placement,
				hasHeaderRow: true, // simplified assumption
				hasHeaderColumn: true,
				// table_wrapper has no verbatim template; \begin{table}/table* is ALWAYS
				// synthesized from this attr, without it a table* loses its two-column span.
				spanning: env.env === 'table*'
			},
			[caption || el('table_caption'), tableNode, ...notes]
		)
	];
}

// sentinels for the editable pieces inside a stored figureTemplate; substituted on save, they
// never reach a compiler and can't collide with real macros.
export const FIG_IMG_SLOT = '\\TexpileFigImageSlot';
export const FIG_CAP_SLOT = '\\TexpileFigCaptionSlot';
export const FIG_LAB_SLOT = '\\TexpileFigLabelSlot';

/** Collect every macro named `name` anywhere in the tree (descending into macro args and groups). */
function collectMacrosDeep(nodes: readonly Node[], name: string, out: Macro[] = []): Macro[] {
	for (const n of nodes) {
		if (n.type === 'macro' && (n as Macro).content === name) out.push(n as Macro);
		const args = (n as Macro).args;
		if (args) for (const a of args) collectMacrosDeep(a.content, name, out);
		const content = (n as { content?: unknown }).content;
		if (Array.isArray(content)) collectMacrosDeep(content as Node[], name, out);
	}
	return out;
}

/** Deep-clone a figure subtree, swapping \includegraphics/\caption/\label for sentinel tokens. */
function slotifyFigure(node: Node): Node {
	if (node.type === 'macro') {
		const m = node as Macro;
		if (m.content === 'includegraphics') return { type: 'string', content: FIG_IMG_SLOT } as unknown as Node;
		if (m.content === 'caption') return { type: 'string', content: FIG_CAP_SLOT } as unknown as Node;
		if (m.content === 'label') return { type: 'string', content: FIG_LAB_SLOT } as unknown as Node;
		if (m.args) return { ...m, args: m.args.map((a) => ({ ...a, content: a.content.map(slotifyFigure) })) } as unknown as Node;
		return node;
	}
	const content = (node as { content?: unknown }).content;
	if (Array.isArray(content)) return { ...(node as object), content: (content as Node[]).map(slotifyFigure) } as unknown as Node;
	return node;
}

function createFigureWrapper(env: Environment, ctx: ConversionContext, _options: ConversionOptions): PMNode[] {
	const graphics = collectMacrosDeep(env.content, 'includegraphics');

	// tier 1: exactly one image anywhere in the float. model it as an editable image whose whole
	// \begin{figure}...\end{figure} is preserved as a slot template, so scaffolding (\centerline,
	// \vspace, \captionsetup, placement) round-trips untouched.
	if (graphics.length === 1) {
		const result = macroHandlers.includegraphics(graphics[0], ctx);
		const imageAttrs = result && result.length > 0 ? { ...result[0].attrs } : null;
		if (imageAttrs) {
			const captionMacro = collectMacrosDeep(env.content, 'caption')[0];
			const captionNodes = captionMacro ? convertNodesToInline(getMacroFirstArg(captionMacro), ctx) : [];
			// the slot replaces the whole \caption, so \caption[short]{long}'s optional arg must
			// be carried separately or it silently vanishes.
			const capOptArg = captionMacro?.args?.find((a) => a.openMark === '[');
			const captionOpt = capOptArg ? printRaw(capOptArg.content) : null;
			const labelMacro = collectMacrosDeep(env.content, 'label')[0];
			const mand = labelMacro?.args?.filter((a) => a.openMark === '{') || [];
			const label = mand[0] ? getTextContent(mand[0].content) : null;
			const figureTemplate = nodeToLatexString(slotifyFigure(env));
			// bareOriginal is about a STANDALONE call: false here, this one came from a real figure
			return [
				el(
					'image',
					{ ...imageAttrs, label, figureTemplate, captionOpt, bareOriginal: false },
					captionNodes.length > 0 ? captionNodes : null
				)
			];
		}
	}

	// tier 2/3 (subfigures, tikz, no graphic): preserve the float verbatim. NB: the tier-1
	// figureTemplate must STAY on nodeToLatexString: slotifyFigure's sentinel nodes don't exist
	// in the source, so slicing it would be wrong.
	return [el('raw_latex', null, [txt(nodeRawSource(env) ?? nodeToLatexString(env))])];
}

function createList(env: Environment, kind: 'bullet' | 'ordered', options: ConversionOptions): PMNode[] {
	const result: PMNode[] = [];
	let currentItemContent: Node[] = [];
	let foundFirstItem = false;

	// content before the first \item (usually whitespace, sometimes real setup like
	// \setlength\itemsep{0pt}) has nowhere to live in the one-list-node-per-item model; carry it
	// verbatim as the first emitted node's preBody rather than silently dropping it.
	const firstItemIndex = env.content.findIndex((n) => n.type === 'macro' && (n as Macro).content === 'item');
	const preItemContent = firstItemIndex > 0 ? env.content.slice(0, firstItemIndex) : [];
	const preBody = preItemContent.some((n) => !isBlankCellNode(n)) ? printRaw(preItemContent).trim() : null;
	const listAttrs = (extra: Record<string, unknown> = {}) => ({
		kind,
		order: kind === 'ordered' ? 1 : null,
		checked: null,
		collapsed: false,
		preBody: result.length === 0 ? preBody : null,
		...extra
	});

	for (const node of env.content) {
		if (node.type === 'macro' && (node as Macro).content === 'item') {
			if (foundFirstItem && currentItemContent.length > 0) {
				const itemBlocks = createListItem(currentItemContent, options);
				if (itemBlocks.length > 0) {
					result.push(el('list', listAttrs(), itemBlocks));
				}
			}
			currentItemContent = [];
			foundFirstItem = true;

			const macro = node as Macro;
			if (macro.args && macro.args.length > 0) {
				// description label \item[Term] becomes bold text at the start. the synthetic
				// \textbf's arg must be brace-delimited: getMacroFirstArg only sees {...} args, so
				// reusing \item's optional [..] arg object as-is made the label invisible to
				// textbf's handler and silently dropped it.
				const optionalArg = macro.args.find((arg) => arg.openMark === '[');
				if (optionalArg && optionalArg.content.length > 0) {
					const syntheticTextbf: Macro = {
						type: 'macro',
						content: 'textbf',
						args: [{ type: 'argument', content: optionalArg.content, openMark: '{', closeMark: '}' }]
					};
					currentItemContent.push({ type: 'group', content: [syntheticTextbf] });
				}

				// the parser puts the item body in an argument with no delimiters
				for (const arg of macro.args) {
					if (arg.openMark === '' && arg.closeMark === '' && arg.content.length > 0) {
						currentItemContent.push(...arg.content);
					}
				}
			}
		} else if (foundFirstItem) {
			currentItemContent.push(node);
		}
	}

	if (foundFirstItem && currentItemContent.length > 0) {
		const itemBlocks = createListItem(currentItemContent, options);
		if (itemBlocks.length > 0) {
			result.push(el('list', listAttrs(), itemBlocks));
		}
	}

	// at least one empty list, for valid structure
	if (result.length === 0) {
		result.push(el('list', listAttrs(), [el('paragraph')]));
	}

	return result;
}

function createListItem(content: Node[], options: ConversionOptions): PMNode[] {
	const filteredContent = content.filter((n, i, arr) => {
		if (n.type !== 'whitespace' && n.type !== 'parbreak') return true;
		// keep whitespace only if between meaningful nodes
		const hasBefore = arr.slice(0, i).some((x) => x.type !== 'whitespace' && x.type !== 'parbreak');
		const hasAfter = arr.slice(i + 1).some((x) => x.type !== 'whitespace' && x.type !== 'parbreak');
		return hasBefore && hasAfter;
	});

	if (filteredContent.length === 0) {
		return [el('paragraph')];
	}

	const blocks = convertNodesToBlocks(filteredContent, options);
	return blocks.length > 0 ? blocks : [el('paragraph')];
}

function createBlockMath(env: Environment, starred: boolean, environment?: string): PMNode[] {
	const lineLabels: string[] = [];
	const contentWithoutLabel: Node[] = [];

	for (const node of env.content) {
		if (node.type === 'macro' && node.content === 'label') {
			const mandatoryArgs = (node as Macro).args?.filter((arg) => arg.openMark === '{') || [];
			const labelText = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';
			if (labelText) lineLabels.push(labelText);
		} else {
			contentWithoutLabel.push(node);
		}
	}

	// slice the exact source only when NO labels were extracted (the label text would remain in
	// the slice and the serializer would re-add it, duplicating). printRaw is the fallback; the
	// regex strip below keeps both paths label-free.
	let mathContent =
		(lineLabels.length === 0 ? mathBodyRawSource(env, [`\\begin{${env.env}}`], [`\\end{${env.env}}`]) : null) ??
		printRaw(contentWithoutLabel);

	// safety net for labels the tokenizer left embedded in string content, where no AST exists
	const labelRegex = /\\label\s*\{([^}]+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = labelRegex.exec(mathContent)) !== null) {
		if (!lineLabels.includes(match[1])) {
			lineLabels.push(match[1]);
		}
	}
	mathContent = mathContent.replace(/\\label\s*\{[^}]+\}/g, '');

	// the editor expects these environments wrapped in the content string
	const MULTILINE_ENVS = [
		'align',
		'align*',
		'gather',
		'gather*',
		'alignat',
		'alignat*',
		'flalign',
		'flalign*',
		'eqnarray',
		'eqnarray*',
		'multline',
		'multline*'
	];
	if (MULTILINE_ENVS.includes(env.env)) {
		mathContent = `\\begin{${env.env}}${mathContent}\\end{${env.env}}`;
	}

	// first label becomes the main label, rest stay in lineLabels
	const label = lineLabels.length > 0 ? lineLabels[0] : null;

	return [
		el('block_math', { label, numbered: !starred, environment: environment || null, lineLabels }, [txt(String(mathContent || '').trim())])
	];
}

/** Horizontal-rule macros captured verbatim so borders round-trip exactly. */
const TABLE_RULE_MACROS = new Set([
	'hline',
	'cline',
	'toprule',
	'midrule',
	'bottomrule',
	'cmidrule',
	'hhline',
	'specialrule',
	'addlinespace',
	'morecmidrules'
]);

/**
 * A tabular row break (`\\`). unified-latex gives it a `content` of '\\' OR the whitespace it
 * swallowed ('\n' at end of line, ' ' before `\hline`); matching only '\\' silently merged every
 * row into one. limitation: a `\ ` control space parses to the identical macro, so an in-cell
 * `\ ` is also treated as a row break (rare in tables; accepted).
 */
function isRowBreak(macro: Macro): boolean {
	const c = (macro as Macro).content;
	return c === '\\' || (typeof c === 'string' && c.length > 0 && /^\s+$/.test(c));
}

function createTable(env: Environment): PMNode[] {
	// capture the EXACT architecture so the table re-serializes render-identically: env name,
	// column spec, width, and \hline-family rules.
	const mandatory = (env.args ?? []).filter((a) => a.openMark === '{');
	// tabularx/tabulary/tabular* take a leading {width} before the column spec
	const takesWidth = env.env === 'tabularx' || env.env === 'tabulary' || env.env === 'tabular*';
	const tabularxWidth = takesWidth && mandatory.length >= 2 ? printRaw(mandatory[0].content) : null;
	const colspecArg = takesWidth ? mandatory[1] : mandatory[mandatory.length - 1];
	const colspec = colspecArg ? printRaw(colspecArg.content) : null;

	const rows: PMNode[] = [];
	let currentRowCells: PMNode[] = [];
	let currentCellContent: Node[] = [];
	let pendingRules = ''; // rules seen since the last row, not yet assigned
	let rowTop = ''; // the rules that precede the row currently being built
	let rowStarted = false;

	// A row "starts" at its first meaningful content / `&`; rules before that are its topRules.
	const startRow = () => {
		if (!rowStarted) {
			rowStarted = true;
			rowTop = pendingRules;
			pendingRules = '';
		}
	};
	const flushRow = (cells: PMNode[]) => {
		rows.push(el('table_row', { topRules: rowTop }, cells.length > 0 ? cells : [createTableCell([])]));
		rowTop = '';
		rowStarted = false;
	};

	for (const node of env.content) {
		if (node.type === 'string' && node.content === '&') {
			startRow();
			currentRowCells.push(createTableCell(currentCellContent));
			currentCellContent = [];
		} else if (node.type === 'macro' && isRowBreak(node as Macro)) {
			startRow();
			currentRowCells.push(createTableCell(currentCellContent));
			flushRow(currentRowCells);
			currentRowCells = [];
			currentCellContent = [];
		} else if (node.type === 'macro' && TABLE_RULE_MACROS.has((node as Macro).content)) {
			pendingRules += printRaw(node);
		} else if (!rowStarted && node.type === 'macro' && ((node as Macro).content === 'rule' || (node as Macro).content === 'hrule')) {
			// a \rule strut before any cell content is row-leading decoration (row-height struts):
			// capture it with topRules or it becomes a horizontal_rule in the first cell and compounds.
			pendingRules += printRaw(node);
		} else {
			const blank =
				node.type === 'whitespace' ||
				node.type === 'parbreak' ||
				node.type === 'comment' ||
				(node.type === 'macro' && (node as Macro).content === 'par');
			if (!blank) startRow();
			currentCellContent.push(node);
		}
	}

	const isOnlyWhitespace = currentCellContent.every(
		(n) =>
			n.type === 'whitespace' ||
			n.type === 'parbreak' ||
			n.type === 'comment' ||
			(n.type === 'macro' && (n as Macro).content === 'par') ||
			(n.type === 'string' && (n.content || '').trim() === '')
	);
	if ((!isOnlyWhitespace || currentRowCells.length > 0) && (currentCellContent.length > 0 || currentRowCells.length > 0)) {
		startRow();
		currentRowCells.push(createTableCell(currentCellContent));
		flushRow(currentRowCells);
	}
	const bottomRules = pendingRules; // rules after the final row

	if (rows.length === 0) {
		rows.push(el('table_row', null, [createTableCell([])]));
	}

	return [el('table', { env: env.env, colspec, tabularxWidth, bottomRules }, resolveSpans(rows))];
}

// a node that contributes no cell content (whitespace / comments / empty strings)
function isBlankCellNode(n: Node): boolean {
	return (
		n.type === 'whitespace' ||
		n.type === 'parbreak' ||
		n.type === 'comment' ||
		(n.type === 'macro' && (n as Macro).content === 'par') ||
		(n.type === 'string' && ((n as { content?: string }).content || '').trim() === '')
	);
}
const isMacroNamed = (n: Node, name: string): boolean => n.type === 'macro' && (n as Macro).content === name;

// detect a leading \multicolumn / \multirow (possibly \multicolumn wrapping \multirow, the shape
// the serializer emits for both-ways spans) and pull out the span counts + actual content.
function unwrapSpans(content: Node[]): { colspan: number; rowspan: number; inner: Node[] } {
	let colspan = 1;
	let rowspan = 1;
	let inner = content;
	const spanOf = (m: Macro): number => {
		const a = (m.args ?? []).filter((x) => x.openMark === '{')[0];
		const v = a ? parseInt(printRaw(a.content).trim(), 10) : NaN;
		return Number.isFinite(v) && v > 0 ? v : 1;
	};
	const textOf = (m: Macro): Node[] => {
		const args = (m.args ?? []).filter((x) => x.openMark === '{');
		return args.length >= 3 ? (args[2].content as Node[]) : inner;
	};
	const meaningful = content.filter((n) => !isBlankCellNode(n));
	if (meaningful.length === 1 && isMacroNamed(meaningful[0], 'multicolumn')) {
		const mc = meaningful[0] as Macro;
		colspan = spanOf(mc);
		inner = textOf(mc);
		const innerMeaningful = inner.filter((n) => !isBlankCellNode(n));
		if (innerMeaningful.length === 1 && isMacroNamed(innerMeaningful[0], 'multirow')) {
			const mr = innerMeaningful[0] as Macro;
			rowspan = spanOf(mr);
			inner = textOf(mr);
		}
	} else if (meaningful.length === 1 && isMacroNamed(meaningful[0], 'multirow')) {
		const mr = meaningful[0] as Macro;
		rowspan = spanOf(mr);
		inner = textOf(mr);
	}
	return { colspan, rowspan, inner };
}

function createTableCell(content: Node[]): PMNode {
	const { colspan, rowspan, inner } = unwrapSpans(content);
	// trim blank AST nodes BEFORE conversion, not the merged text string after: a macro that
	// produces literal spaces as real content (\quad row-label indents) is indistinguishable from
	// incidental whitespace once flattened, and a string-level trim silently eats it.
	let start = 0;
	let end = inner.length;
	while (start < end && isBlankCellNode(inner[start])) start++;
	while (end > start && isBlankCellNode(inner[end - 1])) end--;
	const ctx = createDefaultContext();
	const inlineContent = convertNodesToInline(inner.slice(start, end), ctx);

	return el('table_cell', { colspan, rowspan, colwidth: null }, [el('paragraph', null, inlineContent)]);
}

// drop the placeholder cells LaTeX writes UNDER a \multirow so the prosemirror-tables covered-
// cell model matches: a spanning cell appears once in its origin row, covered positions are
// omitted below. no-rowspan tables come back unchanged.
function resolveSpans(rows: PMNode[]): PMNode[] {
	const covered: boolean[][] = [];
	const mark = (r: number, c: number) => {
		while (covered.length <= r) covered.push([]);
		covered[r][c] = true;
	};
	return rows.map((row, r) => {
		const kept: PMNode[] = [];
		let col = 0;
		row.forEach((cell) => {
			const cs = Number(cell.attrs.colspan ?? 1);
			const rs = Number(cell.attrs.rowspan ?? 1);
			if (covered[r]?.[col]) {
				col += cs; // a placeholder for a rowspan from above: drop it
				return;
			}
			kept.push(cell);
			if (rs > 1) for (let rr = r + 1; rr < r + rs; rr++) for (let cc = col; cc < col + cs; cc++) mark(rr, cc);
			col += cs;
		});
		return el('table_row', { topRules: row.attrs.topRules ?? '' }, kept.length ? kept : [createTableCell([])]);
	});
}

// LaTeX text ligatures to real typographic glyphs. order matters (longest first). applied only
// to plain prose text nodes; \texttt/code keeps -- and `` literal.
function latexLigaturesToUnicode(text: string): string {
	return text
		.replace(/---/g, '—') // em-dash
		.replace(/--/g, '–') // en-dash
		.replace(/``/g, '“')
		.replace(/''/g, '”')
		.replace(/`/g, '‘')
		.replace(/'/g, '’');
}

/** Apply ligatures to ordinary prose text nodes (not \texttt/code, where -- and `` are literal). */
function applyLigaturesToNodes(nodes: PMNode[]): PMNode[] {
	return nodes.map((n) =>
		n.isText && n.text && !n.marks.some((m) => m.type.name === 'code') ? schema.text(latexLigaturesToUnicode(n.text), n.marks) : n
	);
}

/**
 * A group DIRECTLY adjacent to a preceding raw chip ending in a control word is (an argument to)
 * that macro's expansion, e.g. `\rot{Finetune}` where \rot expands to \rotatebox{90}. flattening
 * the group drops its braces: the text fuses onto the control word (undefined command, fatal) or
 * the expansion grabs only the first token (silent render change). preserve the group verbatim;
 * a braced group in text mode renders identically. `prevAst` must be the LITERALLY preceding AST
 * node (any whitespace in between disqualifies adjacency).
 */
function groupAfterRawChip(node: Node, prevAst: Node | null, lastPm: PMNode | undefined): PMNode | null {
	if (node.type !== 'group' || prevAst?.type !== 'macro') return null;
	// lexical control-word tail test on serialized chip text (no AST exists there any more)
	if (!lastPm || lastPm.type.name !== 'inline_latex' || !/\\[a-zA-Z@]+$/.test(lastPm.textContent)) return null;
	return el('inline_latex', null, [txt(nodeRawSource(node) ?? printRaw(node))]);
}

function convertNodesToInline(nodes: Node[], ctx: ConversionContext): PMNode[] {
	const result: PMNode[] = [];
	let prevAst: Node | null = null;
	for (const node of nodes) {
		// line-wrap whitespace right after a `\\` (now a hard_break) is ignored by TeX; drop it
		// instead of carrying a stray leading space onto the next line.
		if (node.type === 'whitespace' && result[result.length - 1]?.type.name === 'hard_break') {
			prevAst = node;
			continue;
		}
		const chip = groupAfterRawChip(node, prevAst, result[result.length - 1]);
		if (chip) {
			result.push(chip);
			prevAst = node;
			continue;
		}
		const converted = convertNodeToInline(node, ctx);
		if (converted) result.push(...converted);
		prevAst = node;
	}
	return applyLigaturesToNodes(collapseTextNodes(result));
}

function convertNodeToInline(node: Node, ctx: ConversionContext): PMNode[] | null {
	switch (node.type) {
		case 'string':
			if (node.content) {
				return txtNodes(node.content, ctx.marks.length > 0 ? ctx.marks : null);
			}
			return null;
		case 'whitespace':
			return txtNodes(' ', ctx.marks.length > 0 ? ctx.marks : null);
		case 'macro': {
			const macro = node as Macro;
			// a commented call captured verbatim by the heuristics: emit as-is
			const rawMacro = macro as RawStamped<Macro>;
			if (rawMacro._raw != null) return [el('inline_latex', null, [txt(String(rawMacro._raw))])];
			if (ignoredMacros.has(macro.content)) return null;
			const handler = macroHandlers[macro.content];
			if (handler) {
				const result = handler(macro, ctx);
				// inline context can only host inline nodes: a handler returning a block here
				// (includegraphics -> image) falls through to the verbatim chip below instead of
				// invalid nesting the lenient builders wouldn't catch.
				if (!result || result.every((n) => n.isInline)) return result;
			}

			// unknown macro: byte-slice when trustworthy, printRaw fallback. strip a trailing
			// \par: greedy macros (\bibitem) swallow the \par we emitted last save into their own
			// args, and left in it compounds every round-trip; the serializer re-adds exactly one.
			const rawLatex = (nodeRawSource(macro) ?? printRaw(macro)).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
			const chip = el('inline_latex', null, [txt(rawLatex)]);
			// a mark from an enclosing \textbf{...} must attach to THIS chip: inline_latex is an
			// atomic leaf with no text child to carry it, so \textbf{\dataset} silently lost its
			// bold without this.
			return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
		}
		case 'group': {
			const gcontent: Node[] = node.content || [];
			// a group scoping a font switch ({\large ...}) must keep its braces or the switch
			// leaks past it. the chip carries ctx.marks itself (no text child to carry a
			// surrounding \texttt mark), same reasoning as the unknown-macro chip above.
			const firstMeaningful = gcontent.find((n) => !(n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'));
			if (firstMeaningful && firstMeaningful.type === 'macro' && SCOPED_SWITCHES.has((firstMeaningful as Macro).content)) {
				const chip = el('inline_latex', null, [txt(printRaw(node))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			// a group wrapping a tabular (e.g. {\resizebox{...}{\begin{tabular}...}}) must NOT
			// flatten to inline: convertNodesToInline has no environment handler, so the WHOLE
			// table would silently drop. preserve the group verbatim; nothing is lost.
			if (containsTabular(gcontent)) {
				const chip = el('inline_latex', null, [txt(printRaw(node))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			return convertNodesToInline(gcontent, ctx);
		}
		case 'inlinemath': {
			// slice the exact source between the delimiters when trustworthy; printRaw fallback
			const mathContent = mathBodyRawSource(node, ['$', '\\('], ['$', '\\)']) ?? printRaw(node.content || []);
			return [el('inline_math', null, [txt(mathContent)])];
		}
		case 'comment': {
			// a mid-paragraph comment must be kept as an inline chip: dropped from PM content it
			// survives only in the orig slice, which regeneration doesn't consult. % consumes to
			// end of line, so baking the trailing newline into the chip matches the source.
			const text = '%' + ((node as { content?: string }).content ?? '') + '\n';
			return [el('inline_latex', null, [txt(text)])];
		}
		case 'verb': {
			// \verb<delim>content<delim> is its OWN AST node type, not 'macro', so it fell through
			// the default case and vanished. rebuild with the ORIGINAL delimiter and keep it raw
			// rather than as \texttt-with-code-mark: \verb content is truly unescaped (\, %, _, {)
			// which \texttt can't tolerate.
			const v = node as unknown as { escape?: string; content?: string };
			const verbChip = el('inline_latex', null, [txt(`\\verb${v.escape ?? '|'}${v.content ?? ''}${v.escape ?? '|'}`)]);
			return [ctx.marks.length > 0 ? verbChip.mark(realMarks(ctx.marks)) : verbChip];
		}
		default:
			return null;
	}
}

// only unmarked inline_latex is merged/promoted (marks can't live on raw_latex, and the serializer
// emits inline_latex verbatim with nothing between siblings, so concatenation is byte-neutral).
const isInlineLatexNode = (n?: PMNode): boolean => !!n && n.type.name === 'inline_latex' && n.marks.length === 0;
const isWhitespaceTextNode = (n?: PMNode): boolean => !!n && n.isText && (n.text ?? '').trim() === '';

// merge a maximal run of adjacent inline_latex nodes (separated only by whitespace text) into
// ONE, baking the separators in. anything else breaks the run. byte-neutral and convergent: the
// merged text re-parses to the same fragments, which re-merge identically.
function mergeAdjacentInlineLatex(nodes: PMNode[]): PMNode[] {
	const out: PMNode[] = [];
	let i = 0;
	while (i < nodes.length) {
		if (!isInlineLatexNode(nodes[i])) {
			out.push(nodes[i]);
			i++;
			continue;
		}
		let raw = nodes[i].textContent;
		let j = i + 1;
		let merged = false;
		while (j < nodes.length) {
			if (isInlineLatexNode(nodes[j])) {
				raw += nodes[j].textContent;
				j++;
				merged = true;
			} else if (isWhitespaceTextNode(nodes[j]) && isInlineLatexNode(nodes[j + 1])) {
				raw += (nodes[j].text ?? '') + nodes[j + 1].textContent;
				j += 2;
				merged = true;
			} else {
				break;
			}
		}
		out.push(merged ? el('inline_latex', null, [txt(raw)]) : nodes[i]);
		i = j;
	}
	return out;
}

// if a paragraph is nothing but raw LaTeX (chips, hard breaks, whitespace, at least one chip and
// NO editable content) return its source so it can become one raw_latex block; else null. a `\\`
// re-parses straight back to a hard_break, so promotion is a fixed point.
function paragraphAsRawLatex(para: PMNode): string | null {
	let out = '';
	let hasChip = false;
	let pure = true;
	para.forEach((child) => {
		if (isInlineLatexNode(child)) {
			out += child.textContent;
			hasChip = true;
		} else if (child.type.name === 'hard_break') {
			out += '\\\\\n';
		} else if (isWhitespaceTextNode(child)) {
			out += child.text ?? '';
		} else {
			pure = false;
		}
	});
	if (!pure || !hasChip) return null;
	while (out.endsWith('\n')) out = out.slice(0, -1); // raw_latex appends its own trailing newline
	return out;
}

/** Convert a list of AST nodes into block nodes, buffering inline runs into paragraphs. */
function convertNodesToBlocks(nodes: Node[], options: ConversionOptions): PMNode[] {
	// verbatim source capture is armed only for the top-level call (grab-and-null; see above)
	const cap = pendingCapture;
	pendingCapture = null;
	const result: PMNode[] = [];
	const ctx = createDefaultContext();
	let currentParagraphContent: PMNode[] = [];
	// source extent of the paragraph currently accumulating (top-level capture only)
	let paraExt: { min: number; max: number } | null = null;
	const extendPara = (node: Node) => {
		if (!cap) return;
		if (!paraExt) paraExt = { min: Infinity, max: -Infinity };
		extendExtent(node, paraExt, cap.prevEnd);
		// an attached-arg macro's closing delimiter has no positioned node; reclaim it from the
		// source or the block's orig.latex loses its final closer(s). see repairExtentTail.
		if ((node as Macro).args?.length) {
			const own = repairExtentTail(node, nodeExtent(node, cap.prevEnd));
			if (own && Number.isFinite(own.max) && own.max > paraExt.max) paraExt.max = own.max;
		}
	};

	// stamp-and-push for top-level blocks. ext null = no trustworthy span: the block still gets a
	// seq (pristine adjacency stays detectable, `pre` can never bridge a deletion) but no slice.
	// a multi-block result from ONE source construct shares the slice under a group id; the
	// serializer substitutes it only when the whole group is present, ordered and unchanged.
	//
	// advanceExt controls ONLY how far cap.prevEnd moves, separate from ext. all callers pass
	// them equal today, but the invariant is subtle: if a block ever gets ext=null while
	// consuming source, prevEnd MUST still advance past it, or the NEXT block's `pre` silently
	// swallows the skipped bytes as gap while its regenerated form is ALSO emitted.
	const pushBlocks = (
		blocks: PMNode[],
		ext: { min: number; max: number } | null,
		advanceExt: { min: number; max: number } | null = ext
	) => {
		if (!cap || blocks.length === 0) {
			result.push(...blocks);
			return;
		}
		const spanOk = ext != null && Number.isFinite(ext.min) && ext.min >= cap.prevEnd && ext.max <= cap.source.length && ext.min < ext.max;
		const latex = spanOk ? cap.source.slice(ext!.min, ext!.max) : null;
		const pre = spanOk ? cap.source.slice(cap.prevEnd, ext!.min) : null;
		const group = spanOk && blocks.length > 1 ? cap.group++ : null;
		for (let i = 0; i < blocks.length; i++) {
			const seq = cap.seq++;
			if (latex == null) {
				result.push(withOrig(blocks[i], { seq }));
				continue;
			}
			// `start` (body-relative source offset) powers positional consumers like the mode-
			// switch scroll sync, not the verbatim serializer. group members carry the shared start.
			const orig: Record<string, unknown> = { latex, pre: i === 0 ? pre : '', seq, norm: null, start: ext!.min };
			if (group != null) {
				orig.group = group;
				orig.groupIndex = i;
				orig.groupSize = blocks.length;
			}
			result.push(withOrig(blocks[i], orig));
		}
		if (advanceExt && Number.isFinite(advanceExt.max)) cap.prevEnd = Math.max(cap.prevEnd, advanceExt.max);
	};
	// deferred inter-word whitespace: held and only emitted (as one space) once real content
	// follows, so boundary whitespace (leading/trailing, e.g. the newline after \section{...})
	// is dropped at the AST level and never becomes an insignificant space.
	let pendingWhitespace: Node | null = null;
	// a leading \indent / \noindent sets the upcoming paragraph's first-line indent (Tab cycles it)
	let pendingIndent: 'auto' | 'indent' | 'noindent' = 'auto';

	function flushParagraph() {
		pendingWhitespace = null; // a trailing deferred space is dropped at the boundary
		currentParagraphContent = collapseTextNodes(currentParagraphContent);
		currentParagraphContent = applyLigaturesToNodes(currentParagraphContent);
		currentParagraphContent = mergeAdjacentInlineLatex(currentParagraphContent);
		while (currentParagraphContent.length > 0 && currentParagraphContent[0].isText && currentParagraphContent[0].text?.trim() === '') {
			currentParagraphContent.shift();
		}
		while (
			currentParagraphContent.length > 0 &&
			currentParagraphContent[currentParagraphContent.length - 1].isText &&
			currentParagraphContent[currentParagraphContent.length - 1].text?.trim() === ''
		) {
			currentParagraphContent.pop();
		}
		if (currentParagraphContent.length > 0) {
			pushBlocks([el('paragraph', pendingIndent !== 'auto' ? { indent: pendingIndent } : null, currentParagraphContent)], paraExt);
		}
		paraExt = null;
		pendingIndent = 'auto';
		currentParagraphContent = [];
	}

	// emit the held inter-word space now that real content follows it
	function realizePendingWhitespace() {
		if (!pendingWhitespace) return;
		// whitespace right after a hard_break is the source's line wrap; TeX ignores it
		if (currentParagraphContent[currentParagraphContent.length - 1]?.type.name === 'hard_break') {
			pendingWhitespace = null;
			return;
		}
		const w = convertNodeToInline(pendingWhitespace, ctx);
		pendingWhitespace = null;
		if (w) currentParagraphContent.push(...w);
	}

	// the literally-previous AST node, for groupAfterRawChip: a whitespace node in between lands
	// here too and correctly disqualifies adjacency.
	let prevNode: Node | null = null;
	for (const node of nodes) {
		if (isBlockNode(node)) {
			flushParagraph();
			const blockNodes = convertNodeToBlock(node, ctx, options);
			if (blockNodes) {
				const rawText = (node as { _raw?: unknown })._raw;
				if (typeof rawText === 'string') {
					// a _raw span extends past this node's own positions (the heuristics consumed
					// forward siblings), so nodeExtent can't compute it, but the TRUE span is
					// exactly known: the slice starts at this node's position. use it as the
					// capture extent too: the emitted block IS that slice, so substitution is safe
					// by construction, and a slice-less block here would break the contiguous
					// chain, losing the NEXT block's `pre` bytes when a neighbour regenerates.
					const startOff = (node as unknown as { position?: { start?: { offset?: number } } }).position?.start?.offset;
					const rawExt = typeof startOff === 'number' ? { min: startOff, max: startOff + rawText.length } : null;
					pushBlocks(blockNodes, rawExt);
				} else {
					pushBlocks(blockNodes, repairExtentTail(node, nodeExtent(node, cap?.prevEnd ?? 0)));
				}
			}
		} else if (node.type === 'parbreak' || (node.type === 'macro' && (node as Macro).content === 'par')) {
			// \par macros flush like parbreaks. a literal \par terminating a paragraph belongs
			// INSIDE that paragraph's span: in the inter-block gap it would drop at EOF, and the
			// first save wouldn't be a byte fixed point. blank-line parbreaks stay in the gap.
			if (node.type === 'macro' && currentParagraphContent.length > 0) extendPara(node);
			flushParagraph();
		} else if (node.type === 'whitespace') {
			// hold the space; leading (nothing buffered) drops outright, trailing is discarded at flush
			if (currentParagraphContent.length > 0) pendingWhitespace = node;
		} else if (node.type === 'comment' && currentParagraphContent.length === 0) {
			// a standalone comment at a block boundary becomes its own raw block. with prose
			// already buffered it falls through (TeX's % doesn't break a paragraph, so block-
			// ifying it would split the paragraph).
			const text = '%' + ((node as { content?: string }).content ?? '');
			pushBlocks([el('raw_latex', null, [txt(text)])], nodeExtent(node, cap?.prevEnd ?? 0));
		} else if (
			node.type === 'macro' &&
			((node as Macro).content === 'indent' || (node as Macro).content === 'noindent') &&
			currentParagraphContent.length === 0
		) {
			// a leading \indent / \noindent becomes the paragraph's indent attr, not a node. it
			// must be INSIDE the paragraph's span: the slice re-parses to the same attr, and a
			// regenerated neighbour can't strand the command in a gap.
			extendPara(node);
			pendingIndent = (node as Macro).content === 'indent' ? 'indent' : 'noindent';
		} else {
			// extend the span over every node reaching inline conversion, even ones converting to
			// nothing: re-parsing the slice drops them identically, the original bytes survive.
			extendPara(node);
			// a group directly adjacent to a raw macro chip keeps its braces (groupAfterRawChip)
			const chip = groupAfterRawChip(node, prevNode, currentParagraphContent[currentParagraphContent.length - 1]);
			if (chip) {
				currentParagraphContent.push(chip);
			} else {
				realizePendingWhitespace();
				const inlineNodes = convertNodeToInline(node, ctx);
				if (inlineNodes) currentParagraphContent.push(...inlineNodes);
			}
		}
		prevNode = node;
	}

	flushParagraph();
	if (result.length === 0) result.push(el('paragraph'));
	// a container whose ENTIRE content is one all-raw paragraph collapses to a single raw_latex
	// block: a wall of adjacent inline chips can't be selected/edited as a unit. sole-block only,
	// so a caption/label paragraph beside a table stays an editable paragraph.
	if (cap) lastCapResult = cap; // stash before every exit; see the declaration comment

	const sole = result.length === 1 && result[0].type.name === 'paragraph' ? result[0] : null;
	const raw = sole ? paragraphAsRawLatex(sole) : null;
	if (raw !== null) {
		// the promoted block covers exactly the paragraph's source, so its orig transfers
		const porig = (sole!.attrs as { orig?: Record<string, unknown> | null }).orig;
		const rawBlock = el('raw_latex', null, [txt(raw)]);
		return [porig ? withOrig(rawBlock, porig) : rawBlock];
	}
	return result;
}

function isBlockNode(node: Node): boolean {
	if (node.type === 'environment') return true;
	if (node.type === 'verbatim') return true;
	if (node.type === 'mathenv') return true;
	if (node.type === 'displaymath') return true;
	if (node.type === 'macro') {
		const macro = node as Macro;

		// a verbatim-captured commented call is ALWAYS a block: it ends in a trailing % comment,
		// so inline emission would let the paragraph's ` \par` land on the comment line
		// (commented out) and compound every save.
		if ((macro as RawStamped<Macro>)._raw != null) return true;

		if (macro.content === 'maketitle' || macro.content === 'title' || macro.content === 'author' || macro.content === 'date') return true;

		const blockMacros = new Set([
			'section',
			'subsection',
			'subsubsection',
			'paragraph',
			'subparagraph',
			'chapter',
			'part',
			'hrule',
			'rule',
			'bibliography',
			'printbibliography',
			'tableofcontents',
			'listoffigures',
			'listoftables',
			'maketitle',
			'newpage',
			'clearpage',
			'pagebreak',
			// cross-document includes: a standalone includedoc chip (block, not paragraph-wrapped)
			'input',
			'include',
			'subfile',
			// image is a BLOCK, so \includegraphics must never buffer into a paragraph's inline
			// content (a mid-paragraph one splits the paragraph, order preserved). in inline-only
			// contexts the non-inline-result guard demotes it to a verbatim chip instead.
			'includegraphics',
			// command-form \abstract builds a block node; through the inline path it buffered a
			// block inside a paragraph (frozen editor on the first structural edit).
			'abstract'
		]);
		if (blockMacros.has(macro.content)) return true;

		// heuristic: 3+ mandatory args is likely a preamble/config command, treat as a raw block
		if (macro.args) {
			const mandatoryArgs = macro.args.filter((arg) => arg.openMark === '{' && arg.closeMark === '}');
			if (mandatoryArgs.length >= 3) return true;
		}
		return false;
	}
	return false;
}

// environments whose body is literal/verbatim and must NOT be parsed as editable content
const VERBATIM_ENVS = new Set([
	'verbatim',
	'verbatim*',
	'Verbatim',
	'lstlisting',
	'minted',
	'tikzpicture',
	'comment',
	'filecontents',
	'filecontents*',
	'alltt',
	'tabular',
	'tabularx',
	'longtable',
	'array'
]);

function convertNodeToBlock(node: Node, ctx: ConversionContext, options: ConversionOptions): PMNode[] | null {
	switch (node.type) {
		// unified-latex parses any environment it recognizes as genuinely verbatim-bodied
		// (verbatim, verbatim*, ...) into this dedicated node shape instead of a generic
		// 'environment' node, even though the fields (env/content/args) are the same.
		case 'verbatim':
			return [codeBlockFromVerbatimEnv(node as unknown as Environment)];
		case 'environment': {
			const env = node as Environment;
			const envHandler = envHandlers[env.env];
			if (envHandler) return envHandler(env, ctx, options);
			if (isMathEnvironment(env.env)) return createBlockMath(env, env.env.endsWith('*'));

			if (transparentEnvironments.has(env.env)) return convertNodesToBlocks(env.content, options);

			// verbatim-like / structural environments stay raw, byte-sliced when possible
			if (VERBATIM_ENVS.has(env.env)) {
				const latexSource = nodeRawSource(node) ?? nodeToLatexString(node);
				return [el('raw_latex', null, [txt(latexSource)])];
			}
			if (options.unknownHandling === 'ignore') return null;

			// default: auto-wrap any other environment as editable, carrying the \begin args
			// verbatim so e.g. minipage keeps its {width}.
			const envArgs = (env as Environment).args && (env as Environment).args!.length ? printRaw((env as Environment).args!) : '';
			const envInner = convertNodesToBlocks(env.content, options);
			return [el('environment', { name: env.env, args: envArgs }, envInner.length > 0 ? envInner : [el('paragraph')])];
		}
		case 'mathenv': {
			// the declared type says `env: string`, but some math envs hand back a nested node
			// instead; same declared-vs-actual gap as codeBlockFromVerbatimEnv's verbatim body.
			const mathEnv = node as Omit<Environment, 'env'> & { env: string | { content?: string } };
			const envName = typeof mathEnv.env === 'string' ? mathEnv.env : mathEnv.env?.content || 'equation';
			const starred = envName.endsWith('*');

			const lineLabels: string[] = [];
			const contentWithoutLabel: Node[] = [];

			for (const n of mathEnv.content || []) {
				if (n.type === 'macro' && n.content === 'label') {
					const mandatoryArgs = (n as Macro).args?.filter((arg) => arg.openMark === '{') || [];
					const labelText = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';
					if (labelText) lineLabels.push(labelText);
				} else {
					contentWithoutLabel.push(n);
				}
			}

			// slice the exact source only when NO labels were extracted (the label text would
			// remain in the slice and get re-added, duplicating); printRaw fallback.
			let mathContent =
				(lineLabels.length === 0 ? mathBodyRawSource(node, [`\\begin{${envName}}`], [`\\end{${envName}}`]) : null) ??
				printRaw(contentWithoutLabel);
			// order matters: 'alignat'.startsWith('align'), so alignat/flalign must be checked
			// BEFORE the plain 'align' prefix (alignat also takes a {n} arg align doesn't, so the
			// misclassification can fail to compile).
			let environment: string | null = null;
			if (envName.startsWith('alignat')) environment = 'alignat';
			else if (envName.startsWith('flalign')) environment = 'flalign';
			else if (envName.startsWith('align')) environment = 'align';
			else if (envName.startsWith('gather')) environment = 'gather';
			// multline/eqnarray need `environment` set too, or their labels vanish on
			// regeneration (see the envHandlers comment).
			else if (envName.startsWith('multline')) environment = 'multline';
			else if (envName.startsWith('eqnarray')) environment = 'eqnarray';

			// the editor expects multiline environments wrapped in the content string
			const MULTILINE_ENVS = [
				'align',
				'align*',
				'gather',
				'gather*',
				'alignat',
				'alignat*',
				'flalign',
				'flalign*',
				'eqnarray',
				'eqnarray*',
				'multline',
				'multline*'
			];
			if (MULTILINE_ENVS.includes(envName)) {
				mathContent = `\\begin{${envName}}${mathContent}\\end{${envName}}`;
			}

			const label = lineLabels.length > 0 ? lineLabels[0] : null;
			return [el('block_math', { label, numbered: !starred, environment, lineLabels }, [txt(String(mathContent || '').trim())])];
		}
		case 'displaymath': {
			// slice the exact source between the delimiters; printRaw fallback
			const displayMathContent = mathBodyRawSource(node, ['\\[', '$$'], ['\\]', '$$']) ?? printRaw(node.content || []);
			return [
				el('block_math', { label: null, numbered: false, environment: null, lineLabels: [] }, [
					txt(String(displayMathContent || '').trim())
				])
			];
		}

		case 'macro': {
			const macro = node as Macro;
			// a commented call captured verbatim by the heuristics: emit as-is
			const rawMacro = macro as RawStamped<Macro>;
			if (rawMacro._raw != null) return [el('raw_latex', null, [txt(String(rawMacro._raw))])];
			if (ignoredMacros.has(macro.content)) return null;

			const handler = macroHandlers[macro.content];
			if (handler) {
				const result = handler(macro, ctx);
				// handlers returning block nodes are taken at face value; inline macros fall
				// through so they can be re-emitted inside a paragraph below.
				if (
					result &&
					result.length > 0 &&
					['heading', 'horizontal_rule', 'includedoc', 'abstract', 'image'].includes(result[0].type.name)
				) {
					return result;
				}
			}
			const handling = options.unknownHandling ?? 'raw_latex';
			if (handling === 'raw_latex') {
				const latexSource = nodeRawSource(node) ?? nodeToLatexString(node);
				if (String(latexSource || '').trim()) return [el('raw_latex', null, [txt(latexSource)])];
			}
			return null;
		}
		default:
			return null;
	}
}

/** the content of \begin{document}...\end{document}, or the whole AST for a fragment. */
function extractContent(ast: Root): Node[] {
	for (const node of ast.content) {
		if (node.type === 'environment' && (node as Environment).env === 'document') {
			return (node as Environment).content;
		}
	}
	return ast.content;
}

/**
 * Convert a LaTeX string to a ProseMirror doc, extracting the document environment's content
 * when present. options.preamble feeds the \newcommand / \def scans below.
 */
export function latexToProseMirror(latex: string, options: ConversionOptions = {}): { doc: PMNode; ast: Root } {
	const parseOptions: ParseOptions = { macros: MACRO_SIGNATURES, environments: ENV_SIGNATURES };

	const ast = parseLatex(latex, parseOptions);

	// capture commented frontmatter calls verbatim BEFORE comments are stripped. "known" =
	// registered signature, handler, table rule, or indent/noindent. TABLE_RULE_MACROS matters:
	// pandas-style tables start a header row with an empty group after \toprule, and arity
	// inference then attached a bogus arg at EVERY rule site ("Misplaced \noalign").
	// indent/noindent are zero-arg but handled by a direct content check, never via
	// macroHandlers, so inference attached the next brace group as an "argument" that its own
	// handling never reads, and the group silently vanished.
	const heuristicKnows = (name: string) =>
		!!parseOptions.macros?.[name] || name in macroHandlers || TABLE_RULE_MACROS.has(name) || name === 'indent' || name === 'noindent';
	heuristicMarkCommentedMacroCalls(ast.content as Node[], latex, heuristicKnows);

	// keep-as-raw fallback for \def/\let-family primitives. the walk also harvests delimited-
	// parameter pairs (\def\bea#1\eea{...} gives bea->eea) from the AST tokens it consumes: a
	// definition merely quoted inside verbatim/comment can never register.
	const delimPairs = new Map<string, string>();
	heuristicMarkTeXPrimitiveDefs(ast.content as Node[], latex, delimPairs);

	// cross-file pairs: macros defined in an include reach this file only as preamble TEXT, so
	// parse it and run the same walk. the substring probes are just a cheap trigger for the
	// parse; extraction is AST-based either way. (\edef doesn't contain "\def", hence all four.)
	if (options.preamble && ['\\def', '\\edef', '\\gdef', '\\xdef'].some((t) => options.preamble!.includes(t))) {
		try {
			const preAst = parseLatex(options.preamble, parseOptions);
			heuristicMarkTeXPrimitiveDefs(preAst.content as Node[], options.preamble, delimPairs);
		} catch {
			/* a malformed preamble must not break body parsing */
		}
	}

	// a \def with a delimited parameter tells us \bea swallows everything up to \eea, typically
	// math the prose path would text-escape into invalid LaTeX. must run after
	// heuristicMarkTeXPrimitiveDefs so only real call sites remain visible.
	heuristicMarkDelimitedMacroSpans(ast.content as Node[], latex, delimPairs);

	// drop trailing comments so a command's args can attach across them (see fn comment)
	stripSamelineComments(ast.content as Node[]);

	// signatures for user-defined commands so their args stay attached. three sources, in
	// priority order:
	const macroInfo: Record<string, { signature: string }> = {};
	//  1. \newcommand/\renewcommand/... in the body
	for (const m of listNewcommands(ast)) macroInfo[m.name] = { signature: m.signature };
	//  2. \newcommand/... in the preamble (the parser only gets the body). the regex is a cheap
	//     trigger for a full parse, not an extractor; extraction is AST-based (listNewcommands).
	if (
		options.preamble &&
		/\\(?:new|renew|provide)command|\\(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand/.test(options.preamble)
	) {
		try {
			for (const m of listNewcommands(parseLatex(options.preamble, parseOptions))) {
				if (!macroInfo[m.name]) macroInfo[m.name] = { signature: m.signature };
			}
		} catch {
			/* a malformed preamble must not break body parsing */
		}
	}
	//  3. heuristic: infer an unknown command's arity from usage so the args don't flatten
	heuristicInferUnknownMacroSignatures(ast, heuristicKnows, macroInfo);

	if (Object.keys(macroInfo).length > 0) {
		attachMacroArgs(ast, macroInfo);
	}

	const content = extractContent(ast);

	// arm verbatim source capture for the top-level pass (norm is filled by parseLatexFile;
	// without it the serializer ignores the attr, so direct converter users see no change). also
	// arm the byte-faithful raw fallback; unlike pendingCapture it must stay live through every
	// nested call, hence try/finally.
	pendingCapture = { source: latex, seq: 0, prevEnd: 0, group: 0 };
	rawSliceSource = latex;
	let blocks: PMNode[];
	try {
		blocks = convertNodesToBlocks(content, options);
	} finally {
		rawSliceSource = null;
		pendingCapture = null; // normally already consumed; clear defensively for error paths
	}

	// the body's trailing gap (after the last top-level block, up to EOF) belongs to no node;
	// stash it on the doc so an untouched save can reproduce it.
	const cap = lastCapResult;
	lastCapResult = null;
	let docAttrs: Record<string, unknown> | null = null;
	if (cap && cap.prevEnd < cap.source.length) {
		docAttrs = { docTail: { text: cap.source.slice(cap.prevEnd, cap.source.length), afterSeq: cap.seq - 1 } };
	}
	const doc = el('doc', docAttrs, blocks.length > 0 ? blocks : [el('paragraph')]);

	return { doc, ast };
}
