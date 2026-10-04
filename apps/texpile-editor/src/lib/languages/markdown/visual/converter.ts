// Markdown (markdown-it tokens) -> ProseMirror, targeting the SAME schema as the LaTeX
// importer. Max-fidelity contract mirrors languages/latex/parser/converter.ts: every construct the walker
// understands becomes a rich node; anything else survives as a raw block/chip sliced verbatim
// from the source, so an unknown token type can never crash a file open or lose bytes.
//
// Verbatim capture is far simpler than the LaTeX side: block tokens carry map = [startLine,
// endLineExclusive), so block spans come straight off a line-offset table. One markdown list of
// N items becomes N flat-list nodes sharing one group (same model as itemize), so substitution
// stays all-or-nothing and an item edit regenerates the whole list.
import type { Token } from 'markdown-it';
import { buildNode, textNodes, collapseTextNodes, type PmNode, type PmMark, realMarks } from './builders';
import { type Cap, buildLineStarts, offsetOfLine, sliceEnd, trimBlankTail, constructEnd } from './sourceSlices';
import { attrStr, dest, imageMarkdown, imageBlock } from './tokenAttrs';
import { blockSpan, emptyItemAt, nestedSpan } from './blockBytes';
import { formatLinkDest, formatLinkTitle } from './inlineSyntax';
import { createMarkdownEngine } from '../engine';
import { cellLocator, contentLocator, locateLines, rangeOf, textSpans, type Locator, type SourceLines } from '../positions';
import {
	bytesSpan,
	concatSpans,
	collectMap,
	noteBlockSpan,
	noteSpans,
	sliceSpans,
	spansOf,
	standsFor,
	type LeafSpan
} from '$lib/editor/visual/sourceSpans';
import { rememberParseMap } from '$lib/editor/visual/parseOrigins';

function withMarks(node: PmNode, marks: PmMark[]): PmNode {
	return marks.length > 0 ? noteSpans(node.mark(realMarks(marks)), spansOf(node)) : node;
}

/** the file a block's content was read from, and where its offsets are in it */
type Src = SourceLines & { at: Locator | null };

/** the bytes a token was read from, when its content is somewhere in the file */
function bytesOf(src: Src, tok: Token): { from: number; to: number; slice: string } | null {
	const r = src.at && rangeOf(tok);
	if (!r) return null;
	const from = src.at!(r.from);
	const to = src.at!(r.to);
	if (from === null || to === null || to < from) return null;
	return { from, to, slice: src.source.slice(from, to) };
}

function leafSpans(src: Src, tok: Token, text: string): LeafSpan[] | null {
	const b = bytesOf(src, tok);
	return b ? textSpans(text, b.from, b.slice) : null;
}

function standingFor(src: Src, tok: Token, len: number): LeafSpan[] | null {
	const b = bytesOf(src, tok);
	return b ? standsFor(len, b.from, b.to) : null;
}

/** the block's lines as its bytes, each line ending standing for the line break it replaced */
function lineSpans(src: SourceLines, first: number, last: number, content: string): LeafSpan[] | null {
	const lines = content.split('\n');
	const starts = locateLines(src, first, last, lines);
	if (starts.some((s) => s === null)) return null;
	const parts: { len: number; spans: LeafSpan[] }[] = [];
	lines.forEach((line, i) => {
		if (i > 0) parts.push({ len: 1, spans: standsFor(1, starts[i - 1]! + lines[i - 1].length, starts[i]!) });
		parts.push({ len: line.length, spans: bytesSpan(line.length, starts[i]!) });
	});
	return concatSpans(parts);
}

/** attrGet returns string | number | null; normalize to a string ('' when absent). */
const MARK_TOKENS: Record<string, string> = {
	strong: 'strong',
	em: 'em',
	s: 's'
};

function convertInline(children: Token[], marks: PmMark[], src: Src): PmNode[] {
	const out: PmNode[] = [];
	for (let i = 0; i < children.length; i++) {
		const tok = children[i];
		const open = tok.type.endsWith('_open') ? tok.type.slice(0, -5) : null;
		const close = tok.type.endsWith('_close') ? tok.type.slice(0, -6) : null;
		if (open && (MARK_TOKENS[open] || open === 'link')) {
			const end = constructEnd(children, i);
			if (open === 'link' && end === i + 1) {
				// `[](u)`: a mark needs text to sit on, so an empty link stays a literal chip
				const literal = `[](${formatLinkDest(dest(tok, 'href'))}${formatLinkTitle(attrStr(tok, 'title'))})`;
				out.push(
					withMarks(buildNode('inline_latex', { lang: 'markdown' }, textNodes(literal, null, standingFor(src, tok, literal.length))), marks)
				);
				i = end;
				continue;
			}
			const mark: PmMark =
				open === 'link'
					? {
							type: 'link',
							attrs: {
								href: dest(tok, 'href'),
								title: attrStr(tok, 'title') || null,
								bare: tok.markup === 'autolink'
							}
						}
					: { type: MARK_TOKENS[open] };
			out.push(...convertInline(children.slice(i + 1, end), [...marks, mark], src));
			i = end;
			continue;
		}
		if (close) continue; // balanced by the recursion above; stray closes are noise

		switch (tok.type) {
			case 'text':
				// an entity's characters stand for the whole of it: `&` is the first byte of `&amp;`
				// too, which is not the same as being written as it
				out.push(
					...textNodes(
						tok.content,
						marks,
						tok.info === 'entity' ? standingFor(src, tok, tok.content.length) : leafSpans(src, tok, tok.content)
					)
				);
				break;
			case 'softbreak':
				out.push(...textNodes(' ', marks, standingFor(src, tok, 1))); // a source line-wrap is semantically a space
				break;
			case 'hardbreak':
				out.push(noteSpans(buildNode('hard_break', { lineBreak: true }), standingFor(src, tok, 1)));
				break;
			case 'code_inline':
				out.push(...textNodes(tok.content, [...marks, { type: 'code' }], leafSpans(src, tok, tok.content)));
				break;
			case 'math_inline':
				// the formula stands for its bytes whole
				out.push(withMarks(noteSpans(buildNode('inline_math', null, textNodes(tok.content)), standingFor(src, tok, 1)), marks));
				break;
			case 'html_inline':
				if (/^<br\s*\/?>$/i.test(tok.content)) {
					out.push(noteSpans(buildNode('hard_break', { lineBreak: true, command: 'br' }), standingFor(src, tok, 1)));
					break;
				}
				// chip per tag (not per element): the prose between <span> and </span> stays
				// editable text instead of getting swallowed into one opaque chip
				out.push(
					withMarks(buildNode('inline_latex', { lang: 'html' }, textNodes(tok.content, null, leafSpans(src, tok, tok.content))), marks)
				);
				break;
			case 'image': {
				// image mixed into a text line: no block figure can sit here, keep it literal
				const literal = imageMarkdown(tok);
				out.push(
					withMarks(buildNode('inline_latex', { lang: 'markdown' }, textNodes(literal, null, standingFor(src, tok, literal.length))), marks)
				);
				break;
			}
			default:
				// unknown inline token: keep its content as a literal chip rather than dropping it
				if (tok.content)
					out.push(
						withMarks(
							buildNode('inline_latex', { lang: 'markdown' }, textNodes(tok.content, null, leafSpans(src, tok, tok.content))),
							marks
						)
					);
		}
	}
	return collapseTextNodes(out);
}

/** the inline content of a block whose lines are [first, last) of the source */
function paragraphContent(inline: Token | undefined, src: SourceLines, first: number, last: number): PmNode[] {
	if (!inline?.children) return [];
	return convertInline(inline.children, [], { ...src, at: contentLocator(src, first, last, inline.content) });
}

/** GFM task marker on the item's first paragraph: strip it and lift into kind/checked attrs.
 *  `raw` is that paragraph's source, so an escaped `\[x\]` is not a box. */
function detectTask(blocks: PmNode[], raw: string): { blocks: PmNode[]; checked: boolean | null } {
	const first = blocks[0];
	if (!/^\[[ xX]\](?:\s|$)/.test(raw) || !first || first.type.name !== 'paragraph' || first.childCount === 0)
		return { blocks, checked: null };
	const lead = first.child(0);
	if (!lead.isText || !lead.text) return { blocks, checked: null };
	const m = /^\[([ xX])\](?:[ \t]|$)/.exec(lead.text);
	if (!m) return { blocks, checked: null };
	const rest = lead.text.slice(m[0].length);
	const kids: PmNode[] = [];
	if (rest)
		kids.push(noteSpans(lead.type.schema.text(rest, lead.marks), sliceSpans(lead.text, spansOf(lead), m[0].length, lead.text.length)));
	for (let i = 1; i < first.childCount; i++) kids.push(first.child(i));
	const para = buildNode('paragraph', { ...first.attrs }, kids);
	return { blocks: [para, ...blocks.slice(1)], checked: m[1] !== ' ' };
}

/** markdown-it hides the paragraphs of a tight list's items; a visible one means blank lines */
function isLoose(tokens: Token[], i: number, j: number): boolean {
	const level = tokens[i].level + 2;
	for (let k = i + 1; k < j; k++) if (tokens[k].type === 'paragraph_open' && tokens[k].level === level && !tokens[k].hidden) return true;
	return false;
}

function listItems(tokens: Token[], i: number, j: number, src: SourceLines): PmNode[] {
	const open = tokens[i];
	const kind = open.type === 'ordered_list_open' ? 'ordered' : 'bullet';
	const start = kind === 'ordered' ? Number(open.attrGet('start') ?? 1) : null;
	// the delimiter as written: `-` `*` `+`, or `.` `)`; what tells two adjacent lists apart
	const marker = open.markup || null;
	const loose = isLoose(tokens, i, j);
	const items: PmNode[] = [];
	let k = i + 1;
	while (k < j) {
		if (tokens[k].type !== 'list_item_open') {
			k++;
			continue;
		}
		const e = constructEnd(tokens, k);
		const inner = convertTokens(tokens, k + 1, e, src);
		const raw = tokens[k + 1]?.type === 'paragraph_open' && tokens[k + 2]?.type === 'inline' ? tokens[k + 2].content : '';
		// an item with nothing in it gets a paragraph of its own, with no bytes: it stands after the
		// marker on the item's line, so a caret in it lands there and not in a neighbour
		const { blocks, checked } = detectTask(
			inner.length > 0 ? inner : [noteBlockSpan(buildNode('paragraph'), emptyItemAt(tokens[k], src))],
			raw
		);
		items.push(
			buildNode(
				'list',
				{
					kind: checked != null ? 'task' : kind,
					// flat-list only reads `order` on the first node of an ordered run (CSS counter-set)
					order: kind === 'ordered' ? (items.length === 0 ? (start ?? 1) : 1) : null,
					checked,
					collapsed: false,
					preBody: null,
					marker,
					loose
				},
				blocks
			)
		);
		k = e + 1;
	}
	if (items.length === 0)
		items.push(
			buildNode('list', { kind, order: null, checked: null, collapsed: false, preBody: null, marker, loose }, [buildNode('paragraph')])
		);
	return items;
}

function tableNode(tokens: Token[], i: number, j: number, src: SourceLines): PmNode {
	const rows: PmNode[] = [];
	const aligns: string[] = [];
	let inHead = false;
	let cells: PmNode[] = [];
	// cells are read left to right along their row's line
	let rowLine = -1;
	let cursor = 0;
	for (let k = i + 1; k < j; k++) {
		const tok = tokens[k];
		switch (tok.type) {
			case 'thead_open':
				inHead = true;
				break;
			case 'thead_close':
				inHead = false;
				break;
			case 'tr_open':
				cells = [];
				rowLine = tok.map ? tok.map[0] : -1;
				cursor = 0;
				break;
			case 'tr_close':
				rows.push(buildNode('table_row', { topRules: '' }, cells));
				break;
			case 'th_open':
			case 'td_open': {
				const e = constructEnd(tokens, k);
				const inline = tokens.slice(k + 1, e).find((t) => t.type === 'inline');
				const style = attrStr(tok, 'style');
				if (inHead) {
					const align = style.includes('right') ? '---:' : style.includes('center') ? ':--:' : style.includes('left') ? ':---' : '---';
					aligns.push(align);
				}
				let content: PmNode[] = [];
				if (inline?.children) {
					const cell = rowLine >= 0 ? cellLocator(src, rowLine, inline.content, cursor) : null;
					if (cell) cursor = cell.cursor;
					content = convertInline(inline.children, [], { ...src, at: cell?.at ?? null });
				}
				cells.push(buildNode(inHead ? 'table_header' : 'table_cell', null, [buildNode('paragraph', null, content)]));
				k = e;
				break;
			}
		}
	}
	// the delimiter row isn't tokenized; rebuild it from cell alignment so regeneration keeps it
	return buildNode('table', { env: null, colspec: aligns.join('|') || null }, rows);
}

function fenceNode(tok: Token, src: SourceLines): PmNode {
	const infoString = (tok.info ?? '').trim();
	const content = tok.content.replace(/\n$/, '');
	// the fence lines are stepped over: the content's lines are found one by one
	const spans = tok.map ? lineSpans(src, tok.map[0], tok.map[1], content) : null;
	// no infoString string means NO language: highlighting a bare fence as Markdown painted noise over
	// plain text, and the settings chip claimed a language the source never recorded
	return buildNode(
		'code_block',
		{ lang: infoString, env: tok.type === 'fence' ? 'fence' : 'indented', args: infoString },
		textNodes(content, null, spans)
	);
}

/** one construct starting at tokens[i] (ending at j inclusive) -> block nodes. */
function convertConstruct(tokens: Token[], i: number, j: number, cap: Cap | null, src: SourceLines): PmNode[] {
	const tok = tokens[i];
	const [first, last] = tok.map ?? [0, 0];
	switch (tok.type) {
		case 'paragraph_open': {
			const inline = tokens[i + 1]?.type === 'inline' ? tokens[i + 1] : undefined;
			// a paragraph that IS one image becomes a block figure
			if (inline?.children?.length === 1 && inline.children[0].type === 'image')
				return [noteSpans(imageBlock(inline.children[0]), blockSpan(src, tok))];
			return [buildNode('paragraph', { indent: 'auto' }, paragraphContent(inline, src, first, last))];
		}
		case 'heading_open': {
			const inline = tokens[i + 1]?.type === 'inline' ? tokens[i + 1] : undefined;
			return [buildNode('heading', { level: Number(tok.tag.slice(1)) || 1, numbered: true }, paragraphContent(inline, src, first, last))];
		}
		case 'blockquote_open':
			return [buildNode('blockquote', null, ensureBlocks(convertTokens(tokens, i + 1, j, src)))];
		case 'bullet_list_open':
		case 'ordered_list_open':
			return listItems(tokens, i, j, src);
		case 'table_open':
			return [tableNode(tokens, i, j, src)];
		case 'fence':
		case 'code_block':
			return [fenceNode(tok, src)];
		case 'hr':
			return [noteSpans(buildNode('horizontal_rule'), blockSpan(src, tok))];
		case 'html_block':
			return [
				buildNode(
					'raw_latex',
					{ lang: 'html' },
					textNodes(tok.content.replace(/\n$/, ''), null, tok.map ? lineSpans(src, first, last, tok.content.replace(/\n$/, '')) : null)
				)
			];
		case 'math_block':
			return [
				noteSpans(
					buildNode('block_math', { label: null, numbered: false, environment: null, lineLabels: [] }, textNodes(tok.content.trim())),
					blockSpan(src, tok)
				)
			];
		// link reference and footnote definitions are invisible to the reader but load-bearing
		// for the file: blocks of their own, verbatim, never a neighbour's gap
		case 'reference_definition':
		case 'footnote_definition':
			return rawBlock(tok, cap, src);
		default:
			// unknown block construct: preserve its exact source lines as a raw markdown block
			return rawBlock(tok, cap, src);
	}
}

/** the construct's exact source lines (top level), else the content its rule recorded */
function rawBlock(tok: Token, cap: Cap | null, src: SourceLines): PmNode[] {
	if (cap && tok.map) {
		const min = offsetOfLine(cap, tok.map[0]);
		const end = trimBlankTail(cap.source, min, sliceEnd(cap, tok.map[1]));
		if (end > min)
			return [buildNode('raw_latex', { lang: 'markdown' }, textNodes(cap.source.slice(min, end), null, bytesSpan(end - min, min)))];
	}
	const content = tok.content.replace(/\n$/, '');
	return content
		? [
				buildNode(
					'raw_latex',
					{ lang: 'markdown' },
					textNodes(content, null, tok.map ? lineSpans(src, tok.map[0], tok.map[1], content) : null)
				)
			]
		: [];
}

function ensureBlocks(blocks: PmNode[]): PmNode[] {
	return blocks.length > 0 ? blocks : [buildNode('paragraph')];
}

/** nested walker (blockquote bodies, list items): each construct's first block carries its span
 *  below the top level too, so a container keeps its untouched children as their bytes */
function convertTokens(tokens: Token[], from: number, to: number, src: SourceLines): PmNode[] {
	const out: PmNode[] = [];
	let i = from;
	let prevEnd = 0;
	while (i < to) {
		const j = constructEnd(tokens, i);
		const blocks = convertConstruct(tokens, i, Math.min(j, to), null, src);
		const span = nestedSpan(tokens, i, src);
		if (span && blocks.length > 0 && span.srcFrom >= prevEnd && (span.srcTo > span.srcFrom || blocks.length === 1)) {
			out.push(noteBlockSpan(blocks[0], { ...span, size: blocks.length }), ...blocks.slice(1));
			prevEnd = span.srcTo;
		} else out.push(...blocks);
		i = j + 1;
	}
	return out;
}

export type MarkdownParseResult = {
	doc: PmNode;
};

export function markdownToProseMirror(source: string): MarkdownParseResult {
	const md = createMarkdownEngine();
	const tokens = md.parse(source, {}) as Token[];
	const cap: Cap = { source, lineStarts: buildLineStarts(source), prevEnd: 0 };
	const src: SourceLines = { source, lineStarts: cap.lineStarts };

	const result: PmNode[] = [];
	let i = 0;
	while (i < tokens.length) {
		const j = constructEnd(tokens, i);
		const blocks = convertConstruct(tokens, i, j, cap, src);
		const map = tokens[i].map;
		// note-and-push, the LaTeX converter's pushBlocks contract: only a trustworthy span is
		// noted, on the construct's first block. a multi-block construct (a list) is one span, so
		// substitution is all-or-nothing.
		const min = map ? offsetOfLine(cap, map[0]) : NaN;
		const end = map ? trimBlankTail(source, min, sliceEnd(cap, map[1])) : NaN;
		const spanOk = map != null && Number.isFinite(min) && min >= cap.prevEnd && end <= source.length && min < end;
		if (spanOk && blocks.length > 0)
			result.push(noteBlockSpan(blocks[0], { srcFrom: min, srcTo: end, size: blocks.length }), ...blocks.slice(1));
		else result.push(...blocks);
		if (spanOk) cap.prevEnd = Math.max(cap.prevEnd, end);
		i = j + 1;
	}

	const docAttrs: Record<string, unknown> = {
		// a file that is CRLF throughout gets its regenerated blocks written the same way
		eol: source.includes('\r\n') && !/(^|[^\r])\n/.test(source) ? '\r\n' : null
	};
	const doc = buildNode('doc', docAttrs, ensureBlocks(result));
	// the document knows its blocks' gaps and constructs from here; parseMarkdownFile registers it
	// against the file, where the bytes are written back from
	rememberParseMap(doc, collectMap(doc), { text: source, from: 0, to: source.length }, false);
	return { doc };
}
