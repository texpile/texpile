// per-macro conversion handlers and the small node factories they share
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getTextContent, getMacroFirstArg } from '../ast-utils';
import {
	buildNode,
	textNode,
	textNodes,
	createDefaultContext,
	realMarks,
	type PmNode,
	type ConversionContext,
	type ConversionOptions
} from '../builders';
import { convertNodesToInline } from './inlineConvert';
import { plainArgText } from './plainArgText';
import { nodeRawSpan, rawTextNode } from './origCapture';

export type MacroHandler = (macro: Macro, ctx: ConversionContext) => PmNode[] | null;

/** a chip under \textbf{...} has no text child to carry the mark, so it wears it itself */
function markChip(chip: PmNode, ctx: ConversionContext): PmNode {
	return ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip;
}

export const macroHandlers: Record<string, MacroHandler> = {
	// synthesized by createList for an \item[label], never present in real source: the label reads
	// as bold text in the editor, and the mark is what still says which text that is
	texpileItemLabel: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'strong' }, { type: 'item_label' }] };
		// math has no text for the mark to ride on, so it wears it: a label of math alone (\item[$\star$]) went back as body
		return convertNodesToInline(content, newCtx).map((n) =>
			n.type.name === 'inline_math' ? n.mark(n.type.schema.marks.item_label.create().addToSet(n.marks)) : n
		);
	},

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
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'em', attrs: { cmd: 'emph' } }] };
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
		return [buildNode('abstract', { sourceForm: 'macro' }, [buildNode('paragraph', null, inline)])];
	},
	textsubscript: (macro, ctx) => {
		const content = getMacroFirstArg(macro);
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'sub' }] };
		return convertNodesToInline(content, newCtx);
	},
	verb: (macro) => {
		const content = getTextContent(getMacroFirstArg(macro));
		return textNodes(content, [{ type: 'code' }]);
	},

	textcolor: (macro, ctx) => {
		if (!macro.args || macro.args.length < 2) return null;
		const mandatoryArgs = macro.args.filter((arg) => arg.openMark === '{');
		if (mandatoryArgs.length < 2) return null;
		const color = getTextContent(mandatoryArgs[0].content);
		const content = mandatoryArgs[1].content;
		const modelArg = macro.args.find((arg) => arg.openMark === '[');
		const model = modelArg ? printRaw(modelArg.content) : null;
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'textcolor', attrs: { color, model } }] };
		return convertNodesToInline(content, newCtx);
	},
	// no color of its own: the document's \sethlcolor applies, and the serializer writes it bare again
	hl: (macro, ctx) => {
		if (!macro.args?.length) return null;
		const newCtx = { ...ctx, marks: [...ctx.marks, { type: 'highlight', attrs: { color: null } }] };
		return convertNodesToInline(getMacroFirstArg(macro), newCtx);
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
		return textNodes(href, [...ctx.marks, { type: 'link', attrs: { href, title: null, bare: true } }]);
	},
	href: (macro, ctx) => {
		const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
		const href = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content).replace(/\\([%#])/g, '$1') : '';
		const marks = [...ctx.marks, { type: 'link', attrs: { href, title: null } }];
		// the text is ordinary inline LaTeX: converted like any other, so \_ comes back as \_
		// rather than growing an escape on every save
		if (mandatoryArgs[1]) return convertNodesToInline(mandatoryArgs[1].content, { ...ctx, marks });
		return textNodes(href, marks);
	},

	section: (macro) => createHeading(macro, 1),
	subsection: (macro) => createHeading(macro, 2),
	subsubsection: (macro) => createHeading(macro, 3),
	paragraph: (macro) => createHeading(macro, 4),
	subparagraph: (macro) => createHeading(macro, 5),
	chapter: (macro) => createHeading(macro, 1, 'chapter'),
	part: (macro) => createHeading(macro, 1, 'part'),

	// special characters all pass ctx.marks through: they're ordinary inline content, often
	// inside \textbf{...} (\textbf{90.1\%}); without this the enclosing mark silently dropped
	// for exactly that token.
	// the logos stay chips: as plain text they came back as the words, not the logos
	LaTeX: (macro, ctx) => [markChip(buildNode('inline_latex', null, [rawTextNode(nodeRawSpan(macro), printRaw(macro))]), ctx)],
	TeX: (macro, ctx) => [markChip(buildNode('inline_latex', null, [rawTextNode(nodeRawSpan(macro), printRaw(macro))]), ctx)],
	// suffix keeps \\* and \\[2ex] as written; command tells \newline from \\ (in a p{} cell
	// \\ ends the row, \newline does not)
	'\\': (macro) => [buildNode('hard_break', { lineBreak: true, suffix: macro.args?.length ? printRaw(macro.args) : '' })],
	newline: () => [buildNode('hard_break', { lineBreak: true, command: 'newline' })],
	'%': (_m, ctx) => textNodes('%', ctx.marks.length > 0 ? ctx.marks : null),
	'&': (_m, ctx) => textNodes('&', ctx.marks.length > 0 ? ctx.marks : null),
	$: (_m, ctx) => textNodes('$', ctx.marks.length > 0 ? ctx.marks : null),
	'#': (_m, ctx) => textNodes('#', ctx.marks.length > 0 ? ctx.marks : null),
	_: (_m, ctx) => textNodes('_', ctx.marks.length > 0 ? ctx.marks : null),
	'{': (_m, ctx) => textNodes('{', ctx.marks.length > 0 ? ctx.marks : null),
	'}': (_m, ctx) => textNodes('}', ctx.marks.length > 0 ? ctx.marks : null),
	textbackslash: (_m, ctx) => textNodes('\\', ctx.marks.length > 0 ? ctx.marks : null),
	textasciitilde: (_m, ctx) => textNodes('~', ctx.marks.length > 0 ? ctx.marks : null),
	textasciicircum: (_m, ctx) => textNodes('^', ctx.marks.length > 0 ? ctx.marks : null),
	ldots: (_m, ctx) => textNodes('…', ctx.marks.length > 0 ? ctx.marks : null),
	dots: (_m, ctx) => textNodes('…', ctx.marks.length > 0 ? ctx.marks : null),
	textendash: (_m, ctx) => textNodes('–', ctx.marks.length > 0 ? ctx.marks : null),
	textemdash: (_m, ctx) => textNodes('—', ctx.marks.length > 0 ? ctx.marks : null),

	// \, \; \: \! \quad \qquad are NOT handled, for the same reason \vspace and \hspace are not:
	// they are spacing, and no plain space says what they say. Mapping them threw the distinction
	// away for good - \, collapsed to a space, so 5\,kg saved back as 5 kg, and \! was dropped
	// outright. As raw chips they round-trip verbatim. Math is unaffected either way: it keeps its
	// own source, so \int f\,dx was never at risk.
	indent: () => null, // a leading indent the editor models implicitly; no visible token

	// size/series/shape switches are NOT dropped either: they fall through to raw, and a {...}
	// group scoping one is kept whole (see SCOPED_SWITCHES / the 'group' case).

	defbibheading: () => null,
	addbibresource: () => null,

	// table_wrapper/figure/block_math capture their own labels before this is reached, so a \label
	// arriving here is a standalone one - after a \section, an \item, a theorem. It becomes a chip
	// in place; a name with structure in it keeps its source, since the attr could only flatten it.
	label: (macro) => {
		const braces = (macro.args ?? []).filter((a) => a.openMark === '{');
		const name = plainArgText(braces[braces.length - 1]);
		if (name) return [buildNode('label', { name })];
		return [buildNode('inline_latex', null, [textNode(printRaw(macro))])];
	},

	def: () => null, // \def\x{...} has no safe arg signature yet, leave for a follow-up
	let: () => null,
	ifdefempty: () => null,

	// \par flushes the current paragraph (null signals it)
	par: () => null,

	hrule: () => [buildNode('horizontal_rule')],
	// \rule{\linewidth}{0.4pt} is exactly what our horizontal_rule emits, so map it back. any
	// other \rule is a sized box/strut (e.g. row-height struts): preserve verbatim rather than
	// collapse to a generic full-width line (which also compounded).
	rule: (macro) => {
		const dims = (macro.args ?? []).filter((a) => a.openMark === '{').map((a) => printRaw(a.content).trim());
		if (dims.length === 2 && dims[0] === '\\linewidth' && dims[1] === '0.4pt') return [buildNode('horizontal_rule')];
		// strip a swallowed trailing \par; (?![a-zA-Z]) is TeX's control-word terminator, so
		// \paragraph can never false-match.
		const rawLatex = printRaw(macro).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
		return [buildNode('inline_latex', null, [textNode(rawLatex)])];
	},

	// the original command is carried through (createCitation reads macro.content) so
	// \citep/\citet/... round-trip instead of collapsing to \autocite. All of these put the
	// citation where they stand; \footcite does NOT (it moves it into a footnote), so it is left
	// raw rather than drawn inline, where it would claim a position it does not occupy.
	cite: (macro) => createCitation(macro),
	citep: (macro) => createCitation(macro),
	citet: (macro) => createCitation(macro),
	parencite: (macro) => createCitation(macro),
	textcite: (macro) => createCitation(macro),
	autocite: (macro) => createCitation(macro),

	// Only the two whose output we can actually compute. \autoref and \cref generate their own
	// word from \figurename or cleveref's \crefname, both subject to package options and babel's
	// language, and \pageref needs a page number that only exists after layout. A chip for those
	// could only ever show a guess, so they stay raw and say exactly what the source says.
	ref: (macro) => createRef(macro, null),
	eqref: (macro) => createRef(macro, 'equation'),

	// every \vspace round-trips verbatim as a raw chip, including \vspace{\baselineskip} (no
	// longer the editor's blank-line protocol; one someone typed is real spacing).
	vspace: (macro) => {
		// lexical trailing-\par strip, same as the `rule` handler
		const rawLatex = printRaw(macro).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
		return [buildNode('inline_latex', null, [textNode(rawLatex)])];
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
		return [buildNode('image', { src, alt: null, title: null, label: null, options, bareOriginal: true })];
	}

	// \footnote is NOT inlined as "[text]": that reflows the document and drops the real
	// page-bottom footnote. it falls through to raw and round-trips whole.

	// \title/\author/\date/\maketitle fall through to raw whole (with \thanks and the \And
	// grid): dropping them made \maketitle rebuild a wrong-height block, shifting the page.
};

/** True if a macro carries a star argument (e.g. `\section*`), parsed via the `s` signature. */
export function macroHasStar(macro: Macro): boolean {
	return (macro.args ?? []).some(
		(arg) => arg.content?.length === 1 && arg.content[0]?.type === 'string' && (arg.content[0] as { content?: string }).content === '*'
	);
}

export function createHeading(macro: Macro, level: number, command: string | null = null): PmNode[] {
	const content = getMacroFirstArg(macro);
	const textNodes = convertNodesToInline(content, createDefaultContext());
	// starred sectioning commands (\section*) are unnumbered
	const numbered = !macroHasStar(macro);
	// \section[short]{long}: the short title (for the contents and running head) rides along raw
	const shortArg = macro.args?.find((arg) => arg.openMark === '[');
	const shortTitle = shortArg ? printRaw(shortArg.content) : null;
	return [buildNode('heading', { level, numbered, command, shortTitle }, textNodes)];
}

export function createIncludeDoc(macro: Macro): PmNode[] | null {
	// keep the path exactly as written (LaTeX resolves the .tex extension itself)
	const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
	const path = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content).trim() : '';
	if (!path) return null; // no argument captured: let it fall through to raw
	const command = typeof macro.content === 'string' && macro.content ? macro.content : 'input';
	return [buildNode('includedoc', { path, command })];
}

export function createCitation(macro: Macro): PmNode[] {
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
	return [buildNode('citation', { variant, prenote, postnote }, key ? [textNode(key)] : null)];
}

export type EnvHandler = (env: Environment, ctx: ConversionContext, options: ConversionOptions) => PmNode[];

export function createRef(macro: Macro, refType: string | null): PmNode[] {
	const mandatoryArgs = macro.args?.filter((arg) => arg.openMark === '{') || [];
	// a name with structure in it keeps its source, the way \label's does: flattening dropped the
	// delimiters from \ref{Remark:$ethf$} and saved a reference that no longer matched its label
	const label = plainArgText(mandatoryArgs[0]);
	if (!label) return [buildNode('inline_latex', null, [textNode(printRaw(macro))])];

	// infer the kind from the label prefix if not provided
	let kind = refType;
	if (!kind && label) {
		const lowerLabel = label.toLowerCase();
		if (lowerLabel.startsWith('tab:') || lowerLabel.startsWith('table:') || lowerLabel.includes('texpile-table-')) {
			kind = 'table';
		} else if (lowerLabel.startsWith('fig:') || lowerLabel.startsWith('figure:') || lowerLabel.includes('texpile-fig-')) {
			kind = 'figure';
		} else if (lowerLabel.startsWith('eq:') || lowerLabel.startsWith('equation:') || lowerLabel.includes('texpile-eq-')) {
			kind = 'equation';
		}
	}

	// keep the original command (ref/eqref) so it round-trips instead of being normalised
	const command = typeof macro.content === 'string' && macro.content ? macro.content : 'ref';
	// unknown target kind: the general 'reference' type
	return [buildNode('ref', { refType: kind ?? 'reference', command }, [textNode(label)])];
}

// only `document` is truly transparent: center/flushleft/flushright change the rendered
// alignment, so they stay as `environment` nodes.
