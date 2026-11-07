// Deterministic ProseMirror -> Typst serializer: third sibling of latexSerializer and the
// markdown serializer. String-returning handlers per node type over the shared Ctx contract;
// doc assembly (verbatim substitution + per-block memo) delegated to blockAssembly.
// Convention: every block handler ends with '\n\n'; the gap a block actually gets is decided
// by blockGap from the NEXT block's typGap, in renderBlocks for nested blocks and through the
// assembly's boundary hook at the top level.
import { Fragment, type Node } from 'prosemirror-model';
import { blankLineAt, createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { Segment } from '$lib/editor/visual/sourceSpans';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { Ctx } from '$lib/serializer/types';
import { renderInline, renderHeadingLine, renderBody, typstShadow, isTypHandlerLeaf } from './typstInline';
import { escLineStart, escTypst, typStr } from './typstEscapes';
import { envSource, ownsLineEnd, type EnvBodyRender } from './envSerializer';
import { mapToCrlf } from '$lib/editor/visual/sourceSpans';
import type { TypstSaveCore } from '../core/plugin/typstDocumentPlugin';
import {
	aloneBlocks,
	blankInline,
	frameHolds,
	inCallBlocks,
	leafSaves,
	nodeSaves,
	ownLines,
	runSaves,
	stringBody,
	tightPair
} from '../core/plugin/documentMap';

// a content block's markup starts afresh: right after its `[` (a table cell, a caption), spaces
// included, a marker binds as at a line start
const BODY_START = /(^|[^\\])(\\\\)*\[[ \t]*$/;
const LINE_HEAD = /(^|\n)(?:[ \t]|\/\*(?:(?!\*\/)[\s\S])*\*\/)*$/;
// escapes and whole raw spans: a backtick left after them opens raw text
const ESCAPES_AND_RAW = /\\[\s\S]|(`{3,})(?!`)[\s\S]*?\1|``|`[^`]*`/g;

function declarationLine(line: string): boolean {
	return /^#(set|let|show|import|include)\b/.test(line);
}

function islandEndsLine(node: Node): boolean {
	const lines = node.textContent.split('\n');
	const last = lines[lines.length - 1];
	const head = lines.findLast((l) => !/^[\s)\]}]/.test(l)) ?? '';
	return /^\/\//.test(last) || (/^\/\*/.test(head) && /\*\/\s*$/.test(last)) || declarationLine(head);
}

/** what the file put before the line of a block a container holds, which its own lines are written relative to */
function fileIndentOf(node: Node, ctx: Ctx): string {
	const nested = !!ctx.parent && ctx.parent.type.name !== 'doc';
	return nested && typeof node.attrs.typIndent === 'string' ? node.attrs.typIndent : '';
}

/** the block's <label>, set off as the source set it: a space, or the line end it had */
function labelOf(node: Node): string {
	if (!node.attrs.label) return '';
	const gap = typeof node.attrs.labelGap === 'string' && /\n/.test(node.attrs.labelGap) ? node.attrs.labelGap : ' ';
	return `${gap}<${String(node.attrs.label)}>`;
}

/** a block bound to whole lines: anything may stand on the line before it and after it */
function lineBound(node: Node): boolean {
	return node.type.name === 'includedoc' || ownLines(node, saveCore);
}

/** may `next` follow `prev` after a single line end without merging into it on reparse? a
 *  comment island counts only as prev: after a paragraph it would join that paragraph */
function glueSafe(prev: Node, next: Node): boolean {
	// an environment is one only while nothing follows it in its paragraph, a list item included
	if (prev.type.name === 'typ_env' || aloneBlocks.has(prev.type.name)) return false;
	if (lineBound(next) || lineBound(prev)) return true;
	if (next.type.name === 'raw_latex' && declarationLine(next.textContent)) return true;
	return prev.type.name === 'raw_latex' && islandEndsLine(prev);
}

/** two declarations, each ending at its line end whatever follows: a rule the editor adds among the opening set
 *  rules (the equations' numbering) keeps to their lines */
function declarationPair(prev: Node, next: Node): boolean {
	return [prev, next].every((node) => node.type.name === 'raw_latex' && declarationLine(node.textContent));
}

/**
 * The separator to write between two adjacent blocks. `contiguous` says the pair is still the
 * source pair (a single newline recorded on `next` is only trusted then); editor-created blocks
 * carry no record and get the natural typst form: tight lists, a blank line elsewhere.
 */
function blockGap(prev: Node, next: Node, contiguous: boolean, nested: boolean): string {
	const gap = next.attrs.typGap;
	if (gap === 'blank') return '\n\n';
	if (gap === 'newline' && (contiguous || declarationPair(prev, next)) && glueSafe(prev, next)) return '\n';
	if (tightPair(prev, next, nested)) return '\n';
	return '\n\n';
}

/** a nested block as its handler writes it, trailing line ends trimmed */
function nestedText(child: Node, parent: Node, i: number): string {
	return serializeTypNode(child, { parent, index: i, isLastChild: i === parent.childCount - 1, inTableCell: false }).replace(/\n+$/, '');
}

/** children from index `from` on, serialized and joined on their gaps, tail trimmed. */
function renderBlocks(parent: Node, from = 0): string {
	let out = '';
	let prev: Node | null = null;
	parent.forEach((child, _offset, i) => {
		if (i < from) return;
		const text = nestedText(child, parent, i);
		if (!text) return;
		if (prev) out += blockGap(prev, child, true, true);
		out += text;
		prev = child;
	});
	return out;
}

function isEmptyParagraph(node: Node): boolean {
	if (node.type.name !== 'paragraph') return false;
	let empty = true;
	node.forEach((c) => {
		if (c.isText ? c.text?.trim() : !blankInline(c)) empty = false;
	});
	return empty;
}

type NodeHandler = (node: Node, ctx: Ctx) => string;

const saveCore: TypstSaveCore = {
	blocks: (parent, from) => renderBlocks(parent, from),
	body: { child: nestedText, gap: (prev, next) => blockGap(prev, next, true, true) },
	inline: (parent, startOfLine, extra, singleLine) => renderInline(parent, startOfLine, extra, singleLine),
	line: (parent, after) => renderHeadingLine(parent, after),
	bracketed: (parent) => renderBody(parent),
	label: (node) => labelOf(node),
	fileIndent: (node, ctx) => fileIndentOf(node, ctx)
};

// the core's own blocks; every other node is saved by its plugin
const CORE_NODES: Record<string, NodeHandler> = {
	paragraph(node) {
		if (isEmptyParagraph(node)) return ''; // blank lines are semantic no-ops, as in both siblings
		// a space opening the line indents it, and after a list an indented line is more of the item
		return renderInline(node, true).replace(/^[ \t]+/, '') + '\n\n';
	},

	// raw source islands (code mode, math, terms, comments): verbatim
	raw_latex: (node) => (node.textContent ? node.textContent + '\n\n' : ''),

	includedoc: (node) => `#include ${typStr(String(node.attrs.path ?? ''))}\n\n`,

	typ_env(node, ctx) {
		const body: EnvBodyRender = { child: nestedText, gap: (prev, next) => blockGap(prev, next, true, true) };
		const nested = !!ctx.parent && ctx.parent.type.name !== 'doc';
		return envSource(node, body, nested) + '\n\n';
	}
};

/** Serialize one node to Typst. Unknown types preserve their content rather than dropping it. */
export function serializeTypNode(node: Node, ctx: Ctx): string {
	const save = nodeSaves.get(node.type.name);
	const handler: NodeHandler | undefined = save ? (n, c) => save(n, c, saveCore) : CORE_NODES[node.type.name];
	if (handler) {
		const out = handler(node, ctx);
		return isTypHandlerLeaf(node) ? typstShadow.shadowed(node, out) : out;
	}
	if (node.isText) return escTypst(node.text ?? '');
	if (node.isInline) {
		// inline strays (should have come through renderInline) degrade to leafText/plain text
		const leafText = node.type.spec.leafText;
		return leafText ? leafText(node) : node.textContent;
	}
	const inner = renderBlocks(node);
	return inner ? inner + '\n\n' : '';
}

/** the inline children of a textblock as one run, and how that block writes it */
function inlineRun(block: Node, nodes: Node[]): Node {
	return block.type.create(block.attrs, Fragment.fromArray(nodes), block.marks);
}

function renderRun(block: Node, run: Node, atStart: boolean): string | null {
	if (block.type.name === 'paragraph') return renderInline(run, atStart);
	const own = runSaves.get(block.type.name);
	if (own) return own.write(run, saveCore);
	return null;
}

/** a stretch of a textblock's inline content, written as the block writes it; null where a
 *  line comment in it would swallow the bytes kept after it */
function inlineBytes(block: Node, nodes: Node[], atStart: boolean): string | null {
	if (block.attrs.typExpr) return null;
	const run = inlineRun(block, nodes);
	let comment = false;
	run.forEach((c) => {
		if (c.type.name === 'inline_latex' && /\/[/*]/.test(c.textContent)) comment = true;
	});
	return comment ? null : renderRun(block, run, atStart);
}

function mapInlineLeaves(block: Node, nodes: Node[], text: string, atStart: boolean): Segment[] | null {
	const run = inlineRun(block, nodes);
	return typstShadow.mapBlockLeaves(
		(n) => renderRun(block, n, atStart) ?? '',
		run,
		{ parent: null, index: 0, isLastChild: true, inTableCell: false },
		text
	);
}

/** a text leaf on its own: the text inside code, the dialect's escaping elsewhere */
function leafBytes(leaf: Node, parent: Node, atStart: boolean, block: Node): string | null {
	const text = leaf.text ?? '';
	if (parent.type.spec.code || parent.type.spec.leafText) return text;
	// a string caption escapes as a string does: the caption is written whole, as is a string body or code
	if (stringBody(parent)) return null;
	if (parent.attrs.typExpr || leaf.marks.some((m) => m.attrs.typStr === true)) return null;
	for (const own of leafSaves) {
		const bytes = own(leaf, text);
		if (bytes !== undefined) return bytes;
	}
	// the colon ending a term is structure: the leaf's own block says so, as does the block
	// spliced when that is the item holding it
	const structure = runSaves.get(parent.type.name)?.structure ?? runSaves.get(block.type.name)?.structure;
	return escTypst(text, atStart, structure ?? '');
}

// a typst marker reads on past the seam into the bytes the file keeps: `@` and `#` eat the word
// after them, a url its trailing punctuation, `/` and `*` pair into a comment. The inline renderer
// escapes all of this when it sees both sides, so the block is written afresh instead
function fuses(bytes: string, tail: string): boolean {
	if (/(^|[^\\])(\\\\)*@[\p{L}\p{N}_:.-]*$/u.test(bytes) && /^[\p{L}\p{N}_:.-]/u.test(tail)) return true;
	if (/#[\p{L}\p{N}_.-]*$/u.test(bytes) && /^[\p{L}\p{N}_.([-]/u.test(tail)) return true;
	if (/https?:\/\/\S*$/.test(bytes) && /^[0-9A-Za-z#$%&*+\-/=@_~[(]/.test(tail)) return true;
	if (/[/*]$/.test(bytes) && /^[/*]/.test(tail)) return true;
	// `--`, `-?` and `...` are shorthands: a hyphen or a dot meeting its kind would read as one
	if (/(^|[^\\])(\\\\)*-$/.test(bytes) && /^[-?]/.test(tail)) return true;
	if (/(^|[^\\])(\\\\)*\.$/.test(bytes) && /^\./.test(tail)) return true;
	// a call written for a mark or a reference ends on `]` or `)`: `.`, `(`, `[` or `;` after it go on with it
	if (/#\S[^\n]*[\])]$/.test(bytes) && /^(?:[([;]|\.[\p{L}_])/u.test(tail)) return true;
	if (/#\S[^\n]*[\])]\.$/.test(bytes) && /^[\p{L}_]/u.test(tail)) return true;
	// a line break is a backslash and the whitespace after it; anything else there escapes instead
	if (/(^|[^\\])(\\\\)*\\$/.test(bytes) && /^\S/.test(tail)) return true;
	return false;
}

// strong and emphasis open and close at a word edge only: a delimiter left against a letter reads
// as a star, whether the seam puts the letter before it or after one that closes a word (`*even*s`)
function tight(before: string, after: string): boolean {
	if (/[\p{L}\p{N}]$/u.test(before) && /^[*_]/.test(after)) return true;
	return /[\p{L}\p{N}][*_]$/u.test(before) && /^[\p{L}\p{N}]/u.test(after);
}

function seam(before: string, after: string): boolean {
	return fuses(before, after) || tight(before, after);
}

// an underscore the file keeps as text, inside a word (`snake_case`), opens emphasis once the
// seam takes the word away from one of its sides. What stood beside it in the file is the
// bytes the change took out where there were any, else the kept bytes on that side
function unbound(head: string, bytes: string, tail: string, gone: string): boolean {
	const word = /[\p{L}\p{N}]$/u;
	const wordStart = /^[\p{L}\p{N}]/u;
	const after = bytes === '' ? tail : bytes;
	const before = bytes === '' ? head : bytes;
	const wasAfter = gone === '' ? tail : gone;
	const wasBefore = gone === '' ? head : gone;
	if (/[\p{L}\p{N}]_$/u.test(head) && wordStart.test(wasAfter) && !wordStart.test(after)) return true;
	if (word.test(wasBefore) && /^_[\p{L}\p{N}]/u.test(tail) && !word.test(before)) return true;
	return false;
}

// a marker at the start of a line opens a list, a heading or a term item; fresh bytes put at a
// line start of the kept ones are escaped as the inline renderer escapes a line start, and
// kept bytes that a fresh line end moves to a line start give the splice up
function atLineStart(head: string, bytes: string, tail: string, code: boolean): string | null {
	const bodyStart = !code && BODY_START.test(head);
	// block comments before the bytes on their line are nothing to typst: a marker after them opens a list
	const out = !code && ((LINE_HEAD.test(head) && head !== '') || bodyStart) ? escLineStart(bytes) : bytes;
	// a marker the file kept mid-line now begins a line: with fresh bytes ending the line above
	// it, or with the bytes before it taken out
	const opens = /^(?:[-+/=]|\d+\.)\s/.test(tail) || /^[-+/=]$/.test(tail);
	const startsLine = /\n[ \t]*$/.test(out) || (bytes === '' && /(^|\n)[ \t]*$/.test(head));
	// so does a space the kept bytes begin with, or fresh bytes opening the block: it indents the line, and after a list that is more of the item
	if ((opens || /^[ \t]/.test(tail)) && startsLine) return null;
	if (!code && head === '' && /^[ \t]/.test(bytes)) return null;
	// or begins a content block, what stood before it in the block taken out or made spaces
	if (bodyStart && /^[ \t]*$/.test(bytes) && /^[ \t]*(?:[-+/=]|\d+\.)\s/.test(tail)) return null;
	// or a marker the file kept at the start of a line or a content block meets a space typed or left after it
	if (!code && /^\s/.test(bytes || tail) && /(?:^|\n|(?:^|[^\\])(?:\\\\)*\[)[ \t]*(?:[-+/=]|\d+\.)$/.test(head)) return null;
	return out;
}

// a term's title is no part of its body's indent: the body goes on two spaces past the marker, as the term handler writes it
const TERM_HEAD = /^([ \t]*(?:(?:[-+]|\d+\.)[ \t]+)*)\/[ \t](?:\\.|[^:\\\n])*:[ \t]*/;

/** what continues a child's lines inside its container: the indentation of its first line when
 *  it begins one, else the indentation the file gave its second line, else the width of what stood
 *  before its first (a marker becomes spaces) */
function continuation(_parent: Node, text: string, head: string): string {
	// what a child indents inside itself (an item's second paragraph, an environment's body) its own
	// handler writes; the container's share is where the child's line begins
	if (/^[ \t]*$/.test(head)) return head;
	const nl = text.indexOf('\n');
	// a first line that opens a bracket goes on inside it: the lines after it are the child's own
	if (nl >= 0 && !/[[({][ \t]*$/.test(text.slice(0, nl))) return /^[ \t]*/.exec(text.slice(nl + 1))![0];
	return head.replace(TERM_HEAD, '$1  ').replace(/\S/g, ' ');
}

const assembly = createBlockAssembly((node, ctx) => serializeTypNode(node, ctx), {
	boundary: (prev, next, contiguous) => blockGap(prev.node, next.node, contiguous, false),
	// a table's grid is in the bytes between its cells: columns:, table.header and the commas between rows
	frameHolds: (node, parsed) => frameHolds(node, parsed) && (!node.attrs.code || node.childCount === parsed.childCount),
	// a body written as code is written with the call around it, as an expression
	spliceChild: (parent, index) => !parent.attrs.code || inCallBlocks.has(parent.child(index).type.name),
	mapLeaves: (node, ctx, text) => typstShadow.mapBlockLeaves(serializeTypNode, node, ctx, text),
	continuation,
	leafBytes,
	inlineBytes,
	mapInlineLeaves,
	// a raw left open takes its words with it: a line break inside three backticks would make the raw a block
	endsLine: (text) => ownsLineEnd(text) || /`/.test(text.replace(ESCAPES_AND_RAW, '')),
	// the line breaks either side of a line taken out from prose would meet as a blank line, a new paragraph
	keepApart: (bytes, tail, head, gone, parent) => {
		if (!parent.type.spec.code && blankLineAt(head, bytes, tail)) return null;
		// a line comment the file keeps runs on over whatever the seam leaves on its line
		if (!parent.type.spec.code && /(^|[^:\\])\/\/[^\n]*$/.test(head) && !/^\r?\n/.test(bytes + tail)) return null;
		// whole on either side: what decides a seam may lie past short fresh bytes (`)` + `.` + `y`)
		if (bytes === '' ? seam(head, tail) : seam(head, bytes + tail) || seam(head + bytes, tail)) return null;
		if (unbound(head, bytes, tail, gone)) return null;
		// code, a chip's source and raw text are written as typed
		const code = !!parent.type.spec.code || /`/.test(head.replace(ESCAPES_AND_RAW, ''));
		return atLineStart(head, bytes, tail, code);
	}
});

export function serializeToTypst(doc: Node): string {
	return serializeToTypstDetailed(doc).text;
}

export function serializeToTypstDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	const result = assembly.serializeDocChildrenDetailed(doc, parse, afresh);
	// a CRLF file stays CRLF: verbatim slices already are, regenerated text is not
	const file = doc.attrs.typFile as { eol?: string } | null;
	if (file?.eol !== '\r\n') return result;
	return { ...result, text: result.text.replace(/\r?\n/g, '\r\n'), map: mapToCrlf(result.map, result.text) };
}
