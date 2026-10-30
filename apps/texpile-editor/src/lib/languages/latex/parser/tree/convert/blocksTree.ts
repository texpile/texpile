// a stretch of the tree to blocks: prose gathered into paragraphs, the rest standing on its own
import { buildNode, createDefaultContext, collapseTextNodes, textNode, type PmNode } from '../../builders';
import { applyLigaturesToNodes, mergeAdjacentInlineLatex, paragraphAsRawLatex } from './inlineRuns';
import { bindTextToChips } from './chipText';
import { blockSpanOf, bytesSpan, noteBlockSpan } from '$lib/editor/visual/sourceSpans';
import { commonFacts } from '../../../knowledge/commands/commandFacts';
import { PieceCursor, type Piece } from '../walk/pieceCursor';
import { bodyOf, type Stretch } from '../walk/stretch';
import { mandatoryArgs, unclosedGroup } from '../walk/treeArgs';
import { sliceOf, type TreeImport, type Span } from './treeImport';
import { isSamelineComment, type ImportCall } from './treeCalls';
import { callInline, endsCharacterWord, isNamed, pieceInline, readCallAt, scopesSwitch, type InlinePrev } from './inlineTree';
import { containsTabularIn } from './tables/tableShapes';
import { blockOfUnit, isDisplay } from './blockUnits';

const BLOCK_NODES = new Set(['Environment', 'VerbatimEnvironment', 'DisplayMath', 'BracketMath', 'OwnMath']);

// \includegraphics is an image block, \abstract builds one; a mid-paragraph one splits the paragraph
const BLOCK_MACROS = new Set([
	'hrule',
	'rule',
	'bibliography',
	'printbibliography',
	'tableofcontents',
	'listoffigures',
	'listoftables',
	'maketitle',
	'title',
	'author',
	'date',
	'newpage',
	'clearpage',
	'pagebreak',
	'input',
	'include',
	'subfile',
	'includegraphics',
	'abstract'
]);

function isCommandPiece(p: Piece): boolean {
	return p.kind === 'node' && (p.node.name === 'ControlWord' || p.node.name === 'ControlSymbol');
}

/** `inParagraph`: prose is buffered, so the three-argument guess must not split it */
export function isBlockUnit(piece: Piece, call: ImportCall | null, inParagraph: boolean): boolean {
	if (!call) return piece.kind === 'node' && BLOCK_NODES.has(piece.node.name);
	if (call.raw != null) return true;
	if (BLOCK_MACROS.has(call.name) || commonFacts(call.name).section != null) return true;
	// three or more arguments at a block boundary is likely a preamble or config command; mid-sentence it is a chip
	return !inParagraph && mandatoryArgs(call).length >= 3;
}

/** a group read through with its braces dropped that holds a block, which stands on its own once written without them */
export function plainGroupHoldsBlock(im: TreeImport, group: Piece): boolean {
	if (!isNamed(group, 'Group')) return false;
	const body = bodyOf(group.node);
	if (scopesSwitch(im, group.node) || containsTabularIn(im, body)) return false;
	const cursor = new PieceCursor(im.src, body);
	for (let p = cursor.next(); p; p = cursor.next()) {
		const call = isCommandPiece(p) ? readCallAt(im, cursor, p) : null;
		if (isBlockUnit(p, call, true) || plainGroupHoldsBlock(im, p)) return true;
	}
	return false;
}

type Extent = { min: number; max: number };

/** `lead`: inline content the first paragraph starts with (an item's label) */
export function blocksOf(im: TreeImport, s: Stretch, lead?: { nodes: PmNode[]; span: Span }): PmNode[] {
	const result: PmNode[] = [];
	const ctx = createDefaultContext();
	const cursors = [new PieceCursor(im.src, s)];
	let prevEnd = lead ? Math.min(s.from, lead.span.from) : s.from;
	let para: PmNode[] = lead?.nodes ?? [];
	let paraExt: Extent | null = lead ? { min: lead.span.from, max: lead.span.to } : null;
	let pendingSpace: Piece | null = null;
	// a leading \indent or \noindent sets the paragraph's first-line indent (Tab cycles it)
	let pendingIndent: 'auto' | 'indent' | 'noindent' = 'auto';
	// a group holding a block, read through: the paragraph it sits in is one construct with it
	let construct: { from: number; min: number; max: number; prevEnd: number; depth: number } | null = null;
	let prev: InlinePrev | null = null;

	function extendPara(span: Span) {
		paraExt ??= { min: Infinity, max: -Infinity };
		paraExt.min = Math.min(paraExt.min, span.from);
		paraExt.max = Math.max(paraExt.max, span.to);
	}

	// a multi-block result from one construct is noted as one span on its first block
	function pushBlocks(blocks: PmNode[], ext: Extent | null) {
		if (!blocks.length) return;
		if (construct) {
			result.push(...blocks);
			if (ext) construct.max = Math.max(construct.max, ext.max);
		} else if (ext && Number.isFinite(ext.min) && ext.min >= prevEnd && ext.max <= im.src.length && ext.min < ext.max) {
			result.push(noteBlockSpan(blocks[0], { srcFrom: ext.min, srcTo: ext.max, size: blocks.length }), ...blocks.slice(1));
		} else result.push(...blocks);
		if (ext && Number.isFinite(ext.max)) prevEnd = Math.max(prevEnd, ext.max);
	}

	function closeConstruct() {
		const c = construct!;
		construct = null;
		const after = prevEnd;
		prevEnd = c.prevEnd;
		pushBlocks(result.splice(c.from), { min: c.min, max: c.max });
		prevEnd = Math.max(after, prevEnd);
	}

	function flushParagraph() {
		pendingSpace = null;
		let content = mergeAdjacentInlineLatex(applyLigaturesToNodes(bindTextToChips(collapseTextNodes(para))));
		while (content.length > 0 && content[0].isText && content[0].text?.trim() === '') content = content.slice(1);
		while (content.length > 0 && content[content.length - 1].isText && content[content.length - 1].text?.trim() === '')
			content = content.slice(0, -1);
		if (content.length > 0)
			pushBlocks([buildNode('paragraph', pendingIndent !== 'auto' ? { indent: pendingIndent } : null, content)], paraExt);
		paraExt = null;
		pendingIndent = 'auto';
		para = [];
		if (construct && cursors.length < construct.depth) closeConstruct();
	}

	function realizePendingSpace() {
		if (!pendingSpace) return;
		const space = pendingSpace;
		pendingSpace = null;
		// a line wrap right after a hard break is ignored by TeX
		if (para[para.length - 1]?.type.name === 'hard_break') return;
		para.push(...(pieceInline(im, space, ctx) ?? []));
	}

	function continuesAfterDisplay(cursor: PieceCursor): boolean {
		const mark = cursor.save();
		let goes = false;
		for (let p = cursor.next(); p; p = cursor.next()) {
			if (p.kind === 'space' || isNamed(p, 'Comment')) continue;
			const call = isCommandPiece(p) ? readCallAt(im, cursor, p) : null;
			goes = !isNamed(p, 'ParBreak') && !isBlockUnit(p, call, true);
			break;
		}
		cursor.restore(mark);
		return goes;
	}

	/** a comment right after a raw block on its line stays in it */
	function withLineComment(cursor: PieceCursor, blocks: PmNode[], span: Span): { blocks: PmNode[]; span: Span } {
		if (blocks.length !== 1 || blocks[0].type.name !== 'raw_latex' || blocks[0].textContent !== sliceOf(im, span)) return { blocks, span };
		const mark = cursor.save();
		let p = cursor.next();
		while (p?.kind === 'space' && !im.src.slice(p.from, p.to).includes('\n')) p = cursor.next();
		if (!p || !isNamed(p, 'Comment')) {
			cursor.restore(mark);
			return { blocks, span };
		}
		const text = im.src.slice(span.from, p.to);
		return {
			blocks: [buildNode('raw_latex', blocks[0].attrs, [textNode(text, null, bytesSpan(text.length, span.from))])],
			span: { from: span.from, to: p.to }
		};
	}

	for (;;) {
		const cursor = cursors[cursors.length - 1];
		const piece = cursor.next();
		if (!piece) {
			if (cursors.length === 1) break;
			cursors.pop();
			continue;
		}
		const call = isCommandPiece(piece) ? readCallAt(im, cursor, piece) : null;
		const unit: Span = call ?? piece;
		if (isBlockUnit(piece, call, para.length > 0)) {
			// a display with prose before it and no blank line sits inside that paragraph
			const display = isDisplay(im, piece);
			const inParagraph = display && para.length > 0;
			const continuesAfter = display && continuesAfterDisplay(cursor);
			flushParagraph();
			let blocks = blockOfUnit(im, piece, call, ctx);
			if (blocks && display && (inParagraph || continuesAfter))
				blocks = blocks.map((b) =>
					b.type.name === 'block_math' ? b.type.create({ ...b.attrs, inParagraph, continuesAfter }, b.content, b.marks) : b
				);
			if (blocks) {
				const placed = withLineComment(cursor, blocks, unit);
				pushBlocks(placed.blocks, { min: placed.span.from, max: placed.span.to });
			}
		} else if (isNamed(piece, 'ParBreak') || call?.name === 'par') {
			// a \par ending a paragraph belongs inside its span, or the first save is no fixed point
			if (call && para.length > 0) extendPara(call);
			flushParagraph();
		} else if (piece.kind === 'space') {
			if (piece.eaten) continue;
			if (endsCharacterWord(piece, prev, para[para.length - 1])) extendPara(piece);
			else if (para.length > 0) pendingSpace = piece;
			prev = null;
			continue;
		} else if (isNamed(piece, 'Comment') && ((para.length === 0 && pendingIndent === 'auto') || isSamelineComment(im.src, piece.from))) {
			// a comment at a block boundary is a raw block; one after something on its line lives in the bytes
			if (para.length === 0 && !isSamelineComment(im.src, piece.from))
				pushBlocks([rawComment(im, piece)], { min: piece.from, max: piece.to });
		} else if (call && (call.name === 'indent' || call.name === 'noindent') && para.length === 0) {
			// inside the paragraph's span: the slice reparses to the same attr
			extendPara(call);
			pendingIndent = call.name === 'indent' ? 'indent' : 'noindent';
		} else if (
			(!call &&
				isNamed(piece, 'Group') &&
				piece.node.lastChild?.name === 'GroupEnd' &&
				!groupFollowsChip(piece, prev, para[para.length - 1])) ||
			(call && call.raw == null && unclosedGroup(call)?.body)
		) {
			// a brace the file never closes: what follows reads on its own, the call up to the brace a chip
			const body = call ? unclosedGroup(call)!.body! : bodyOf(piece.node);
			const opener = { from: unit.from, to: body.from };
			extendPara(opener);
			realizePendingSpace();
			const text = sliceOf(im, opener);
			para.push(buildNode('inline_latex', null, [textNode(text, null, bytesSpan(text.length, opener.from))]));
			cursors.push(new PieceCursor(im.src, body));
			prev = null;
			continue;
		} else if (!call && plainGroupHoldsBlock(im, piece) && !groupFollowsChip(piece, prev, para[para.length - 1])) {
			const ext = { min: Math.min(paraExt?.min ?? Infinity, piece.from), max: piece.to };
			if (construct) construct.max = Math.max(construct.max, ext.max);
			else construct = { from: result.length, min: ext.min, max: ext.max, prevEnd, depth: cursors.length + 1 };
			cursors.push(new PieceCursor(im.src, bodyOf(piece.node)));
			prev = null;
			continue;
		} else {
			extendPara(unit);
			realizePendingSpace();
			const inline = call ? callInline(im, call, ctx) : groupOrPiece(im, piece, prev, para[para.length - 1], ctx);
			if (inline) para.push(...inline);
		}
		prev = call ? { command: call.raw == null ? call.name : null, to: call.to } : null;
	}

	flushParagraph();
	if (construct) closeConstruct();
	if (result.length === 0) result.push(buildNode('paragraph'));
	// a container holding one all-raw paragraph collapses to one raw block: a wall of chips edits as a unit
	const sole = result.length === 1 && result[0].type.name === 'paragraph' && result[0].attrs.indent === 'auto' ? result[0] : null;
	const raw = sole ? paragraphAsRawLatex(sole) : null;
	if (raw !== null) {
		const span = blockSpanOf(sole!);
		const exact = span && im.src.startsWith(raw, span.srcFrom);
		return [noteBlockSpan(buildNode('raw_latex', null, [textNode(raw, null, exact ? bytesSpan(raw.length, span.srcFrom) : null)]), span)];
	}
	return result;
}

function rawComment(im: TreeImport, piece: Piece): PmNode {
	const text = sliceOf(im, piece);
	return buildNode('raw_latex', null, [textNode(text, null, bytesSpan(text.length, piece.from))]);
}

function groupFollowsChip(piece: Piece, prev: InlinePrev | null, last: PmNode | undefined): boolean {
	return (
		isNamed(piece, 'Group') &&
		prev?.command != null &&
		prev.to === piece.from &&
		!!last &&
		last.type.name === 'inline_latex' &&
		/\\(?:[a-zA-Z@]+|[^a-zA-Z@\s])$/.test(last.textContent)
	);
}

function groupOrPiece(
	im: TreeImport,
	piece: Piece,
	prev: InlinePrev | null,
	last: PmNode | undefined,
	ctx: ReturnType<typeof createDefaultContext>
): PmNode[] | null {
	return groupFollowsChip(piece, prev, last) ? [chipFor(im, piece)] : pieceInline(im, piece, ctx);
}

function chipFor(im: TreeImport, piece: Piece): PmNode {
	const text = sliceOf(im, piece);
	return buildNode('inline_latex', null, [textNode(text, null, bytesSpan(text.length, piece.from))]);
}
