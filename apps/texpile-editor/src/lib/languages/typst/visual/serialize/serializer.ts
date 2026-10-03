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
import { escLineStart, escTypst, renderInline, renderHeadingLine, renderBody, typStr, typstShadow, isTypHandlerLeaf } from './typstInline';
import { cellCall, rowCells, tableBody, tableFrame } from './tableSerializer';
import { endsInLineComment } from './equationClose';
import { envSource, ownsLineEnd, type EnvBodyRender } from './envSerializer';
import { mapToCrlf } from '$lib/editor/visual/sourceSpans';
export { escTypst, renderInline } from './typstInline';

function indentAfterFirstLine(text: string, indent: string): string {
	return text
		.split('\n')
		.map((l, i) => (i === 0 || l === '' ? l : indent + l))
		.join('\n');
}

// blocks that begin with a line-start token: anything may precede them on the previous line
const LINE_START_BLOCKS = new Set(['list', 'heading', 'code_block', 'term_item', 'includedoc']);
// blocks whose last line ends them: anything may follow on the next line
const LINE_END_BLOCKS = new Set(['heading', 'list', 'code_block', 'term_item', 'includedoc']);
// a content block's markup starts afresh: right after its `[` (a table cell, a caption), spaces
// included, a marker binds as at a line start
const BODY_START = /(^|[^\\])(\\\\)*\[[ \t]*$/;
const LINE_HEAD = /(^|\n)(?:[ \t]|\/\*(?:(?!\*\/)[\s\S])*\*\/)*$/;
// escapes and whole raw spans: a backtick left after them opens raw text
const ESCAPES_AND_RAW = /\\[\s\S]|(`{3,})(?!`)[\s\S]*?\1|``|`[^`]*`/g;

// the language picker's names, as the tokens typst's highlighter knows them by
const RAW_LANGS: Record<string, string> = { 'c++': 'cpp', 'c#': 'cs', 'f#': 'fs' };

// typst reads a raw block's language as one word of letters, digits, `-` and `_`, the rest of its line as code
function rawLang(infoString: string): string {
	return RAW_LANGS[infoString.toLowerCase()] ?? infoString.replace(/[^\p{L}\p{N}_-]+/gu, '-');
}

/** an argument list cut at its own commas, not those inside a string, a call or a content block */
function topLevelArgs(list: string): string[] {
	const args: string[] = [];
	const open: string[] = [];
	let quoted = false;
	let from = 0;
	for (let i = 0; i < list.length; i++) {
		const ch = list[i];
		const markup = open[open.length - 1] === '[';
		if (quoted) {
			if (ch === '\\') i++;
			else if (ch === '"') quoted = false;
		} else if (ch === '\\' && markup) i++;
		else if (ch === '"' && !markup) quoted = true;
		else if ('([{'.includes(ch)) open.push(ch);
		else if (')]}'.includes(ch)) open.pop();
		else if (ch === ',' && open.length === 0) {
			args.push(list.slice(from, i));
			from = i + 1;
		}
	}
	args.push(list.slice(from));
	return args;
}

function declarationLine(line: string): boolean {
	return /^#(set|let|show|import|include)\b/.test(line);
}

function islandEndsLine(node: Node): boolean {
	const lines = node.textContent.split('\n');
	const last = lines[lines.length - 1];
	const head = lines.findLast((l) => !/^[\s)\]}]/.test(l)) ?? '';
	return /^\/\//.test(last) || (/^\/\*/.test(head) && /\*\/\s*$/.test(last)) || declarationLine(head);
}

/** the block's <label>, set off as the source set it: a space, or the line end it had */
function labelOf(node: Node): string {
	if (!node.attrs.label) return '';
	const gap = typeof node.attrs.labelGap === 'string' && /\n/.test(node.attrs.labelGap) ? node.attrs.labelGap : ' ';
	return `${gap}<${String(node.attrs.label)}>`;
}

function headingLine(node: Node): string | null {
	return node.attrs.numbered === false ? null : renderHeadingLine(node, labelOf(node));
}

function lineBound(node: Node, blocks: Set<string>): boolean {
	return blocks.has(node.type.name) && (node.type.name !== 'heading' || headingLine(node) != null);
}

/** may `next` follow `prev` after a single line end without merging into it on reparse? a
 *  comment island counts only as prev: after a paragraph it would join that paragraph */
function glueSafe(prev: Node, next: Node): boolean {
	// an environment is one only while nothing follows it in its paragraph, a list item included
	if (prev.type.name === 'typ_env') return false;
	if (lineBound(next, LINE_START_BLOCKS) || lineBound(prev, LINE_END_BLOCKS)) return true;
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
	if (prev.type.name === 'list' && next.type.name === 'list' && prev.attrs.kind === next.attrs.kind) return '\n';
	if (prev.type.name === 'term_item' && next.type.name === 'term_item') return '\n';
	if (nested && prev.type.name === 'paragraph' && next.type.name === 'list') return '\n';
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
		if (c.isText ? c.text?.trim() : c.type.name !== 'hard_break') empty = false;
	});
	return empty;
}

type NodeHandler = (node: Node, ctx: Ctx) => string;

const NODES: Record<string, NodeHandler> = {
	paragraph(node) {
		if (isEmptyParagraph(node)) return ''; // blank lines are semantic no-ops, as in both siblings
		// a space opening the line indents it, and after a list an indented line is more of the item
		return renderInline(node, true).replace(/^[ \t]+/, '') + '\n\n';
	},

	heading(node) {
		const level = Math.max(1, Number(node.attrs.level ?? 1));
		const label = labelOf(node);
		const line = headingLine(node);
		if (line == null) {
			const args = node.attrs.numbered === false ? `level: ${level}, numbering: none` : `depth: ${level}`;
			return `#heading(${args})[${renderBody(node)}]${label}\n\n`;
		}
		// an empty heading is still a heading (it steps the counter); `=` alone is one
		return `${'='.repeat(level)}${line ? ' ' + line : ''}${label}\n\n`;
	},

	code_block(node) {
		const infoString = rawLang(String(node.attrs.args ?? '').trim());
		const content = node.textContent;
		const runs = content.match(/`{3,}/g);
		const fence = '`'.repeat(runs ? Math.max(3, ...runs.map((r) => r.length)) + 1 : 3);
		return `${fence}${infoString}\n${content}\n${fence}\n\n`;
	},

	// raw source islands (code mode, math, terms, comments): verbatim
	raw_latex: (node) => (node.textContent ? node.textContent + '\n\n' : ''),

	includedoc: (node) => `#include ${typStr(String(node.attrs.path ?? ''))}\n\n`,

	image(node) {
		// `options` is the verbatim extra-args slice (width: 70%, fit: "cover", ...); re-emitted
		// untouched so a resize/crop written in source survives the visual editor
		const rawOpts = typeof node.attrs.options === 'string' ? node.attrs.options.trim() : '';
		let optsStr = rawOpts;
		// a drag-resize leaves snapped pixel width/maxWidth attrs (never set by the converter);
		// translate them to a percent of the text column, replacing any width: already carried.
		// wysiwym by design - the editor column stands in for the page width
		const w = Number(node.attrs.width);
		const max = Number(node.attrs.maxWidth);
		if (Number.isFinite(w) && Number.isFinite(max) && w > 0 && max > 0) {
			const pct = Math.min(100, Math.max(1, Math.round((w / max) * 100)));
			const rest = topLevelArgs(rawOpts)
				.map((s) => s.trim())
				.filter((s) => s && !/^width:/.test(s));
			optsStr = [`width: ${pct}%`, ...rest].join(', ');
		}
		const opts = optsStr ? `, ${optsStr}` : '';
		const img = `image(${typStr(String(node.attrs.src ?? ''))}${opts})`;
		const showCaption = node.attrs.showCaption !== false;
		const caption = showCaption ? renderBody(node) : '';
		const label = labelOf(node);
		// a bare #image is one the source never wrapped in a figure; keep it bare
		if (node.attrs.numbered === false && !caption) return `#${img}${label}\n\n`;
		// a caption shown empty is written empty, as LaTeX writes \caption{}: typst draws its "Figure 1:" as the editor does
		return `#figure(${img}${showCaption ? `, caption: [${caption}]` : ''})${label}\n\n`;
	},

	table(node) {
		const body = tableBody(node, '', renderBlocks);
		return body ? `#${body}\n\n` : '';
	},

	// a row or a cell written on its own, inside the frame of the table that holds it
	table_row: (node) => rowCells(node, renderBlocks),
	table_cell: (node) => cellCall(node, renderBlocks),
	table_header: (node) => cellCall(node, renderBlocks),

	// #figure(table(...), caption: [...]) <label> — the typst way to caption a table
	table_wrapper(node) {
		let table: Node | null = null;
		let captionNode: Node | null = null;
		node.forEach((c) => {
			if (c.type.name === 'table') table = c;
			else if (c.type.name === 'table_caption') captionNode = c;
		});
		if (!table) return '';
		const body = tableBody(table, '  ', renderBlocks);
		if (!body) return '';
		const cap = captionNode as Node | null;
		const caption = cap && cap.childCount > 0 ? renderBody(cap) : '';
		const label = labelOf(node);
		return `#figure(\n  ${body}${caption || node.attrs.typCaption ? `,\n  caption: [${caption}]` : ''},\n)${label}\n\n`;
	},

	block_math(node) {
		const inner = node.textContent.trim();
		if (!inner) return '';
		// the label rides after the closing dollar, where typst attaches it to the equation
		const label = labelOf(node);
		const close = endsInLineComment(inner) ? '\n$' : ' $';
		return `$ ${inner}${close}${label}\n\n`;
	},

	blockquote(node) {
		const inner = renderBlocks(node);
		if (!inner) return '';
		return `#quote(block: true)[\n  ${indentAfterFirstLine(inner, '  ')}\n]\n\n`;
	},

	typ_env(node, ctx) {
		const body: EnvBodyRender = { child: nestedText, gap: (prev, next) => blockGap(prev, next, true, true) };
		const nested = !!ctx.parent && ctx.parent.type.name !== 'doc';
		return envSource(node, body, nested) + '\n\n';
	},

	horizontal_rule() {
		return '#line(length: 100%)\n\n';
	},

	// a title written on its own, inside the frame of the item that holds it
	term_title: (node) => renderInline(node, false, ':', true),

	term_item(node) {
		const title = node.childCount > 0 && node.child(0).type.name === 'term_title' ? node.child(0) : null;
		const desc = renderBlocks(node, title ? 1 : 0);
		// the first unescaped colon ends the term, so one in the title is escaped
		return `/ ${title ? renderInline(title, false, ':', true) : ''}: ${indentAfterFirstLine(desc, '  ')}\n\n`;
	},

	list(node) {
		const kind = String(node.attrs.kind ?? 'bullet');
		// the explicit "5." the source wrote comes back as written; otherwise '+' auto-numbers
		// and only a run starting off the natural count needs its marker (order is 1 on every
		// non-first node of a run, by the importer's contract)
		const order = Number(node.attrs.order ?? 1);
		const explicit = typeof node.attrs.typNumber === 'number' ? node.attrs.typNumber : null;
		const marker = kind === 'ordered' ? (explicit != null ? `${explicit}. ` : order !== 1 ? `${order}. ` : '+ ') : '- ';
		// continuation lines must sit past the marker to stay inside the item
		const body = indentAfterFirstLine(renderBlocks(node) || '', ' '.repeat(marker.length));
		return marker + body + '\n\n';
	}
};

/** Serialize one node to Typst. Unknown types preserve their content rather than dropping it. */
export function serializeTypNode(node: Node, ctx: Ctx): string {
	const handler = NODES[node.type.name];
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
	if (block.type.name === 'term_title') return renderInline(run, false, ':', true);
	return null;
}

/** a stretch of a textblock's inline content, written as the block writes it; null where a
 *  line comment in it would swallow the bytes kept after it */
function inlineBytes(block: Node, nodes: Node[], atStart: boolean): string | null {
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
	// inline raw sits between backticks or in the string of a #raw call
	if (leaf.marks.some((m) => m.type.name === 'code')) return /[`"\\]/.test(text) ? null : text;
	// the colon ending a term is structure: the leaf's own block says so, as does the block
	// spliced when that is the item holding it
	return escTypst(text, atStart, parent.type.name === 'term_title' || block.type.name === 'term_title' ? ':' : '');
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
	frameHolds: (node, parsed) => node.type.name !== 'table' || tableFrame(node) === tableFrame(parsed),
	mapLeaves: (node, ctx, text) => typstShadow.mapBlockLeaves(serializeTypNode, node, ctx, text),
	continuation,
	leafBytes,
	inlineBytes,
	mapInlineLeaves,
	endsLine: ownsLineEnd,
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
