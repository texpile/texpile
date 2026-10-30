// per-command conversion: marks, links, headings, references, citations, includes and images
import { buildNode, textNode, textNodes, createDefaultContext, type PmNode, type ConversionContext } from '../../builders';
import { PLAIN_TEXT_COMMANDS } from './plainTextCommands';
import { argText, hasStar, mandatoryArgs, optionalArg, type TreeArg } from '../walk/treeArgs';
import { PieceCursor } from '../walk/pieceCursor';
import { childrenIn } from '../walk/stretch';
import { chipOf, sliceOf, type TreeImport } from './treeImport';
import type { ImportCall } from './treeCalls';
import { inlineOf } from './inlineTree';

export type TreeMacroHandler = (im: TreeImport, call: ImportCall, ctx: ConversionContext) => PmNode[] | null;

function firstBraced(call: ImportCall): TreeArg | undefined {
	return mandatoryArgs(call).find((a) => a.body && a.body.to > a.body.from);
}

function markedFirst(im: TreeImport, call: ImportCall, ctx: ConversionContext, ...marks: ConversionContext['marks']): PmNode[] {
	const arg = firstBraced(call);
	return arg?.body ? inlineOf(im, arg.body, { ...ctx, marks: [...ctx.marks, ...marks] }) : [];
}

export function plainText(im: TreeImport, arg: TreeArg | undefined): string | null {
	if (!arg?.body) return null;
	const cursor = new PieceCursor(im.src, arg.body);
	let out = '';
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'word') out += sliceOf(im, p);
		else if (p.kind === 'space') out += ' ';
		else if (p.node.name === 'OpenBracket' || p.node.name === 'CloseBracket') out += sliceOf(im, p);
		else return null;
	}
	const text = out.trim();
	return text.length > 0 ? text : null;
}

/** an argument read as a name: a comment and its line end dropped as TeX drops them, whitespace runs as one space */
export function argTextContent(im: TreeImport, arg: TreeArg | undefined): string {
	if (!arg?.body) return '';
	let out = '';
	let at = arg.body.from;
	for (const c of childrenIn(arg.body)) {
		if (c.name !== 'Comment') continue;
		out += im.src.slice(at, c.from);
		at = c.to;
		if (im.src[at] === '\n') at++;
		while (im.src[at] === ' ' || im.src[at] === '\t') at++;
	}
	return (out + im.src.slice(Math.min(at, arg.body.to), arg.body.to)).replace(/\s+/g, ' ');
}

function colorMark(
	im: TreeImport,
	call: ImportCall,
	ctx: ConversionContext,
	type: string,
	extra: Record<string, unknown> = {}
): PmNode[] | null {
	const braced = mandatoryArgs(call);
	if (braced.length < 2 || !braced[1].body) return null;
	const color = argTextContent(im, braced[0]);
	const modelArg = optionalArg(call);
	const model = modelArg ? argText(im.src, modelArg) : null;
	return inlineOf(im, braced[1].body, { ...ctx, marks: [...ctx.marks, { type, attrs: { color, ...extra, model } }] });
}

export function createHeading(im: TreeImport, call: ImportCall, level: number, command: string | null = null): PmNode[] {
	const arg = firstBraced(call);
	const content = arg?.body ? inlineOf(im, arg.body, createDefaultContext()) : [];
	const short = optionalArg(call);
	return [buildNode('heading', { level, numbered: !hasStar(call), command, shortTitle: short ? argText(im.src, short) : null }, content)];
}

function createIncludeDoc(im: TreeImport, call: ImportCall): PmNode[] | null {
	const path = argTextContent(im, mandatoryArgs(call)[0]).trim();
	return path ? [buildNode('includedoc', { path, command: call.name })] : null;
}

function createCitation(im: TreeImport, call: ImportCall): PmNode[] {
	// a chip has no word for the star (\citet* lists every author)
	if (hasStar(call)) return [chipOf(im, call)];
	const optional = call.args.filter((a) => a.present && a.open === '[');
	const key = argTextContent(im, mandatoryArgs(call)[0]);
	const [prenote, postnote] =
		optional.length === 2 ? optional.map((a) => argTextContent(im, a)) : ['', optional.length === 1 ? argTextContent(im, optional[0]) : ''];
	return [buildNode('citation', { variant: call.name, prenote, postnote }, key ? [textNode(key)] : null)];
}

function createRef(im: TreeImport, call: ImportCall, refType: string | null): PmNode[] {
	if (hasStar(call)) return [chipOf(im, call)];
	const label = plainText(im, mandatoryArgs(call)[0]);
	if (!label) return [chipOf(im, call)];
	let kind = refType;
	if (!kind) {
		const lower = label.toLowerCase();
		if (lower.startsWith('tab:') || lower.startsWith('table:') || lower.includes('texpile-table-')) kind = 'table';
		else if (lower.startsWith('fig:') || lower.startsWith('figure:') || lower.includes('texpile-fig-')) kind = 'figure';
		else if (lower.startsWith('eq:') || lower.startsWith('equation:') || lower.includes('texpile-eq-')) kind = 'equation';
	}
	return [buildNode('ref', { refType: kind ?? 'reference', command: call.name }, [textNode(label)])];
}

/** the call's bytes, a trailing \par it swallowed left out */
function chipWithoutPar(im: TreeImport, call: ImportCall): PmNode[] {
	const text = sliceOf(im, call).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
	return [chipOf(im, { from: call.from, to: call.from + text.length })];
}

export function imageOf(im: TreeImport, call: ImportCall): PmNode[] | null {
	const braced = mandatoryArgs(call);
	if (!braced.length) return null;
	const src = argTextContent(im, braced[braced.length - 1]);
	const opt = optionalArg(call);
	return [buildNode('image', { src, alt: null, title: null, label: null, options: opt ? argText(im.src, opt) : '', bareOriginal: true })];
}

function logo(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] {
	return [chipOf(im, call, ctx)];
}

function heading(level: number, command: string | null = null): TreeMacroHandler {
	return (im, call) => createHeading(im, call, level, command);
}

function cite(im: TreeImport, call: ImportCall): PmNode[] {
	return createCitation(im, call);
}

function include(im: TreeImport, call: ImportCall): PmNode[] | null {
	return createIncludeDoc(im, call);
}

const HANDLERS: Record<string, TreeMacroHandler> = {
	textbf: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'strong' }),
	textit: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'em' }),
	emph: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'em', attrs: { cmd: 'emph' } }),
	underline: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'u' }),
	texttt: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'code' }),
	textsuperscript: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'sup' }),
	textsubscript: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'sub' }),
	abstract: (im, call, ctx) => {
		const arg = firstBraced(call);
		return [buildNode('abstract', { sourceForm: 'macro' }, [buildNode('paragraph', null, arg?.body ? inlineOf(im, arg.body, ctx) : [])])];
	},
	textcolor: (im, call, ctx) => colorMark(im, call, ctx, 'textcolor'),
	// no color of its own: the document's \sethlcolor applies, and the serializer writes it bare again
	hl: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'highlight', attrs: { color: null } }),
	colorbox: (im, call, ctx) => colorMark(im, call, ctx, 'highlight', { cmd: 'colorbox' }),
	url: (im, call, ctx) => {
		const href = argTextContent(im, mandatoryArgs(call)[0]);
		return textNodes(href, [...ctx.marks, { type: 'link', attrs: { href, title: null, bare: true } }]);
	},
	href: (im, call, ctx) => {
		const braced = mandatoryArgs(call);
		const href = argTextContent(im, braced[0]).replace(/\\([%#])/g, '$1');
		const opt = optionalArg(call);
		const marks = [...ctx.marks, { type: 'link', attrs: { href, title: null, options: opt ? argText(im.src, opt) : null } }];
		return braced[1]?.body ? inlineOf(im, braced[1].body, { ...ctx, marks }) : textNodes(href, marks);
	},
	section: heading(1),
	subsection: heading(2),
	subsubsection: heading(3),
	paragraph: heading(4),
	subparagraph: heading(5),
	chapter: heading(1, 'chapter'),
	part: heading(1, 'part'),
	// the logos stay chips: as plain text they came back as the words, not the logos
	LaTeX: logo,
	TeX: logo,
	// suffix keeps \\* and \\[2ex] as written; command tells \newline from \\ (in a p{} cell \\ ends the row)
	'\\': (im, call) => [buildNode('hard_break', { lineBreak: true, suffix: sliceOf(im, { from: call.node.to, to: call.to }) })],
	newline: () => [buildNode('hard_break', { lineBreak: true, command: 'newline' })],
	...Object.fromEntries(
		Object.entries(PLAIN_TEXT_COMMANDS).map(([name, char]): [string, TreeMacroHandler] => [
			name,
			(_im, _call, ctx) => textNodes(char, ctx.marks.length > 0 ? ctx.marks : null)
		])
	),
	// a leading one is the paragraph's indent; anywhere else it prints one
	indent: (im, call, ctx) => [chipOf(im, call, ctx)],
	// table_wrapper, figure and block_math take their own labels first; one reaching here stands alone
	label: (im, call) => {
		const braced = mandatoryArgs(call);
		const name = plainText(im, braced[braced.length - 1]);
		return [name ? buildNode('label', { name }) : chipOf(im, call)];
	},
	par: () => null,
	hrule: () => [buildNode('horizontal_rule')],
	// \rule{\linewidth}{0.4pt} is exactly what horizontal_rule writes; any other \rule is a sized box or strut
	rule: (im, call) => {
		const dims = mandatoryArgs(call).map((a) => argText(im.src, a).trim());
		if (dims.length === 2 && dims[0] === '\\linewidth' && dims[1] === '0.4pt') return [buildNode('horizontal_rule')];
		return chipWithoutPar(im, call);
	},
	// \footcite moves the citation into a footnote, so it stays raw
	cite,
	citep: cite,
	citet: cite,
	parencite: cite,
	textcite: cite,
	autocite: cite,
	// \autoref, \cref and \pageref print words or pages only the compile knows
	ref: (im, call) => createRef(im, call, null),
	eqref: (im, call) => createRef(im, call, 'equation'),
	vspace: (im, call) => chipWithoutPar(im, call),
	input: include,
	include,
	subfile: include,
	includegraphics: (im, call) => imageOf(im, call)
};

export const treeMacroHandlers = new Map(Object.entries(HANDLERS));
