// Typst source -> ProseMirror, over the CST from our own wasm build of typst-syntax
// (packages/typst-syntax-wasm). Max-fidelity contract mirrors the LaTeX and Markdown importers:
// every construct the walker understands becomes a rich node; anything else survives as a raw
// block/chip sliced verbatim from the source, so an unknown node kind can never crash a file
// open or lose bytes. Code mode (#let, #show, #import, function calls...) is deliberately ALL
// raw islands in this phase — the visual editor edits markup structure, source mode edits code.
//
// Verbatim capture is the simplest of the three dialects: the CST carries exact UTF-16 offsets
// on every node, so block spans come straight off the tree. Typst's tree is flat at the markup
// level (paragraph boundaries are explicit Parbreak nodes, a Hash is a SIBLING of the code
// expression it introduces), so block grouping is synthesized here.
import type { SyntaxNode, Tree } from '@lezer/common';
import { Fragment } from 'prosemirror-model';
import { TypstParser } from 'texpile-typst-syntax-wasm';
import { buildNode, type PmNode } from './builders';
import { mergeAdjacentRawBlocks } from '$lib/editor/visual/mergeRawBlocks';
import { rawBlock, convertInline } from './inlineConvert';
import { children, unquote, expressionEnd, DECLARATION_KINDS, EXPRESSION_KINDS } from './reading/syntaxUtils';
import { blockSpanOf, collectMap, noteBlockSpan, withAttrs } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap } from '$lib/editor/visual/parseOrigins';
import { gapKind, labelledEnd, restOnlySpace, type GapKind } from './reading/blockEnds';
import { blockCallSeg } from './calls/blockCallSeg';
import { callLevel } from './reading/callLevel';
import { typstDrawnCommand } from './calls/drawnCommand';
import { markupBlocks } from '../core/plugin/documentMap';
import { importOf } from './importCore';

// one parser for the module: Source::replace reparses incrementally against the previous text,
// and the converter has no per-document state of its own
let parser: TypstParser | null = null;
function parseTree(source: string): Tree {
	if (!parser) parser = new TypstParser();
	return parser.parse(source);
}

export type Seg = {
	blocks: PmNode[];
	from: number;
	to: number;
};

/** recreate `node` with its typGap; types without the attr pass through unchanged */
export function withGap(node: PmNode, gap: GapKind): PmNode {
	if (!node.type.spec.attrs || !('typGap' in node.type.spec.attrs)) return node;
	return withAttrs(node, { ...node.attrs, typGap: gap });
}

export function ensureBlocks(blocks: PmNode[]): PmNode[] {
	return blocks.length > 0 ? blocks : [buildNode('paragraph')];
}

/**
 * The block walker: children of a Markup node -> block segments. Runs at the top level (where
 * the caller notes block spans) and inside list items (where it doesn't). Every segment after the
 * first carries the kind of gap the source had before it.
 */
/** the blocks of nested segments, each segment's first block carrying its bytes, so a container
 *  keeps its untouched children as the file had them */
export function notedBlocks(segs: Seg[]): PmNode[] {
	const out: PmNode[] = [];
	let prevEnd = 0;
	for (const s of segs) {
		if (s.blocks.length > 0 && s.from >= prevEnd && s.to > s.from) {
			out.push(noteBlockSpan(s.blocks[0], { srcFrom: s.from, srcTo: s.to, size: s.blocks.length }), ...s.blocks.slice(1));
			prevEnd = s.to;
		} else out.push(...s.blocks);
	}
	return out;
}

export function convertMarkup(kids: SyntaxNode[], src: string): Seg[] {
	const segs: Seg[] = [];
	let buf: SyntaxNode[] = [];

	function flushPara() {
		while (buf.length > 0 && buf[buf.length - 1].name === 'Space') buf.pop();
		if (buf.length === 0) return;
		const content = convertInline(buf, src, []);
		if (content.length > 0) {
			segs.push({
				blocks: [buildNode('paragraph', { indent: 'auto' }, content)],
				from: buf[0].from,
				to: buf[buf.length - 1].to
			});
		}
		buf = [];
	}

	for (let i = 0; i < kids.length; i++) {
		const k = kids[i];
		const markup = markupBlocks.get(k.name);
		if (markup) {
			const block = markup(importOf(src), kids, i);
			if (block) {
				flushPara();
				segs.push(block.seg);
				i = block.next - 1;
			} else buf.push(k);
			continue;
		}
		switch (k.name) {
			case 'Parbreak':
				flushPara();
				break;
			case 'Space':
				if (buf.length > 0) buf.push(k); // leading whitespace is inter-block gap, not content
				break;
			case 'Hash': {
				const next = kids[i + 1];
				const end = next ? expressionEnd(kids, i + 1, src) : i;
				const last = kids[end];
				const after = end + 1;
				if (
					next &&
					(DECLARATION_KINDS.has(next.name) || (EXPRESSION_KINDS.has(next.name) && buf.length === 0 && restOnlySpace(kids, after, src)))
				) {
					flushPara();
					// a set rule keeps the comment ending its line: drawn as a chip of its own, it would otherwise
					// leave the comment a block of its own, which an edit to the rule would put on the next line
					const note = next.name === 'SetRule' && last === next ? lineEndComment(kids, after, src) : null;
					// the terminating semicolon is part of the statement, not of the prose after it
					if (note) segs.push({ blocks: [rawBlock(src.slice(k.from, note.to), k.from)], from: k.from, to: note.to });
					else segs.push({ blocks: [includeOrRaw(k, next, last, src)], from: k.from, to: last.to });
					i = (note ? after + 2 : after) - 1;
				} else {
					// a block-level call ends the paragraph it stands in, as Typst ends it
					const lifted = !!next && callLevel(next, src) === true;
					const block =
						next && (buf.length === 0 || lifted)
							? blockCallSeg(lifted ? kids.slice(0, labelledEnd(kids, i + 2)) : kids, i, src, lifted)
							: null;
					if (block) {
						flushPara();
						segs.push(block.seg);
						i = block.next - 1;
					} else {
						buf.push(k);
					}
				}
				break;
			}
			case 'LineComment':
			case 'BlockComment':
				if (buf.length === 0) {
					segs.push({ blocks: [rawBlock(src.slice(k.from, k.to), k.from)], from: k.from, to: k.to });
				} else {
					buf.push(k);
				}
				break;
			default:
				buf.push(k);
		}
	}
	flushPara();
	for (let s = 1; s < segs.length; s++) {
		segs[s].blocks[0] = withGap(segs[s].blocks[0], gapKind(src.slice(segs[s - 1].to, segs[s].from)));
	}
	return segs;
}

/** a // comment after `kids[at]`, a space away on the same line */
function lineEndComment(kids: SyntaxNode[], at: number, src: string): SyntaxNode | null {
	const space = kids[at];
	const comment = kids[at + 1];
	if (space?.name !== 'Space' || /[\r\n]/.test(src.slice(space.from, space.to))) return null;
	return comment?.name === 'LineComment' ? comment : null;
}

/**
 * `#include "chapter.typ"` and nothing fancier becomes a navigable chip; any other include form
 * (expressions, missing extension, import-like paths, a semicolon) stays a raw block. The path
 * keeps its extension because Typst requires it — the chip's opener defaults to .typ only as a
 * fallback.
 */
function includeOrRaw(hash: SyntaxNode, stmt: SyntaxNode, last: SyntaxNode, src: string): PmNode {
	if (stmt.name === 'ModuleInclude' && last === stmt) {
		const real = children(stmt).filter((c) => !['Include', 'Space'].includes(c.name));
		if (real.length === 1 && real[0].name === 'Str') {
			const path = unquote(src.slice(real[0].from, real[0].to));
			if (/\.typ$/i.test(path)) return buildNode('includedoc', { path, command: 'typst' });
		}
	}
	return rawBlock(src.slice(hash.from, last.to), hash.from);
}

export type TypstParseResult = {
	doc: PmNode;
};

/** the line ending to regenerate with: CRLF only for a file that uses nothing else */
function lineEnding(source: string): string {
	return /\r\n/.test(source) && !/(^|[^\r])\n/.test(source) ? '\r\n' : '\n';
}

export function typstToProseMirror(source: string): TypstParseResult {
	// the parser reads U+FEFF as text (the first heading would become a paragraph); it goes
	// into the leading gap instead and comes back on save
	const bom = source.startsWith('\uFEFF');
	const body = bom ? source.slice(1) : source;
	const eol = lineEnding(body);
	const typFile = bom || eol !== '\n' ? { bom, eol } : null;
	const kids = children(parseTree(body).topNode);
	const segs = convertMarkup(kids, body);

	// note-and-push, the shared pushBlocks contract: a trustworthy span is noted on the construct's
	// first block; a multi-block construct (a list run) is one span, so verbatim substitution is
	// all-or-nothing. Offsets count into the markup after the byte order mark
	const result: PmNode[] = [];
	let prevEnd = 0;
	for (const s of segs) {
		if (s.blocks.length === 0) continue;
		const spanOk = s.from >= prevEnd && s.to <= body.length && s.from < s.to;
		if (spanOk) result.push(noteBlockSpan(s.blocks[0], { srcFrom: s.from, srcTo: s.to, size: s.blocks.length }), ...s.blocks.slice(1));
		else result.push(...s.blocks);
		if (spanOk) prevEnd = Math.max(prevEnd, s.to);
	}

	// an empty or whitespace-only file still needs one paragraph (doc content is block+); its
	// bytes ride along as the paragraph's protected leading gap, so even "\r\n" round-trips
	if (result.length === 0) {
		const empty = noteBlockSpan(buildNode('paragraph', { indent: 'auto' }), { srcFrom: body.length, srcTo: body.length, size: 1 });
		return { doc: known(buildNode('doc', { typFile }, [empty]), body) };
	}

	const merged = mergeAdjacentRawBlocks(buildNode('doc', { typFile }, result), body, typstDrawnCommand);
	return { doc: known(restampGaps(merged, body), body) };
}

/** the document knows its blocks' gaps and constructs from here; parseTypstFile registers it
 *  against the file, where the bytes are written back from */
function known(doc: PmNode, body: string): PmNode {
	rememberParseMap(doc, collectMap(doc), { text: body, from: 0, to: body.length }, false);
	return doc;
}

/** merged raw islands come back without their typGap; every top-level gap is re-read from the
 *  bytes between the spans, which the merge kept exact */
function restampGaps(doc: PmNode, body: string): PmNode {
	const kids: PmNode[] = [];
	let changed = false;
	// where the construct before ended; null once one could not be placed
	let prevEnd: number | null = 0;
	// blocks still to come of the construct whose span was noted on an earlier block
	let members = 0;
	doc.forEach((child, _offset, i) => {
		const span = blockSpanOf(child);
		const pre = i > 0 && span && prevEnd != null && prevEnd <= span.srcFrom ? body.slice(prevEnd, span.srcFrom) : null;
		if (span) {
			prevEnd = span.srcTo;
			members = span.size - 1;
		} else if (members > 0) members--;
		else prevEnd = null;
		if (pre == null) {
			kids.push(child);
			return;
		}
		const gap = gapKind(pre);
		if (child.attrs.typGap === gap || !('typGap' in (child.type.spec.attrs ?? {}))) {
			kids.push(child);
			return;
		}
		kids.push(withGap(child, gap));
		changed = true;
	});
	return changed ? doc.copy(Fragment.fromArray(kids)) : doc;
}
