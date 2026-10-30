// a stretch of the tree to inline content: text, chips, math, and what the macro handlers make
import type { SyntaxNode } from '@lezer/common';
import { buildNode, textNode, textNodes, collapseTextNodes, realMarks, type PmNode, type ConversionContext } from '../../builders';
import { ignoredMacros, isScopedSwitch } from '../../macros';
import { CHARACTER_WORDS } from './plainTextCommands';
import { applyLigaturesToNodes } from './inlineRuns';
import { bindTextToChips } from './chipText';
import { noteSpans, spansOf, standsFor, bytesSpan } from '$lib/editor/visual/sourceSpans';
import { PieceCursor, type Piece } from '../walk/pieceCursor';
import { bodyOf, type Stretch } from '../walk/stretch';
import { mandatoryArgs, argText, hasUnclosedGroup } from '../walk/treeArgs';
import { chipOf, sliceOf, sourceText, type TreeImport, type Span } from './treeImport';
import { commandName, isSamelineComment, readImportCall, type ImportCall } from './treeCalls';
import { treeMacroHandlers } from './macroTree';
import { containsTabularIn } from './tables/tableShapes';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';

/** what came just before, for the chips that take the group or space after them */
export type InlinePrev = { command: string | null; to: number };

const BLOCK_NODES = new Set(['Environment', 'VerbatimEnvironment', 'DisplayMath', 'BracketMath']);
const INLINE_MATH = new Set(['InlineMath', 'ParenMath']);

function isCommand(p: Piece): boolean {
	return p.kind === 'node' && (p.node.name === 'ControlWord' || p.node.name === 'ControlSymbol');
}

export function isNamed(p: Piece | null, name: string): boolean {
	return !!p && p.kind === 'node' && p.node.name === name;
}

/** the converter reads these commands itself, so their calls say nothing of an unknown command's arguments */
export function convertsItself(name: string): boolean {
	return treeMacroHandlers.has(name) || name === 'indent' || name === 'noindent';
}

export function readCallAt(im: TreeImport, cursor: PieceCursor, piece: Piece): ImportCall {
	return readImportCall(im, cursor, piece, convertsItself);
}

/** a group right after a raw chip ending in a command is its argument; flattened, its text fuses onto the command */
function groupAfterRawChip(im: TreeImport, piece: Piece, prev: InlinePrev | null, last: PmNode | undefined): PmNode | null {
	if (!isNamed(piece, 'Group') || prev?.command == null || prev.to !== piece.from) return null;
	if (!last || last.type.name !== 'inline_latex' || !/\\(?:[a-zA-Z@]+|[^a-zA-Z@\s])$/.test(last.textContent)) return null;
	return chipOf(im, piece);
}

function growsOver(span: Span, last: PmNode | undefined): boolean {
	if (!last?.isText) return false;
	const spans = spansOf(last);
	const tail = spans?.[spans.length - 1];
	if (!tail || tail.srcTo !== span.from || tail.to !== last.text!.length) return false;
	noteSpans(last, [...spans!.slice(0, -1), { ...tail, srcTo: span.to, kind: 'sub' }]);
	return true;
}

/** the space after such a word is gone from the page (\textbackslash input reads \input) */
export function endsCharacterWord(piece: Piece, prev: InlinePrev | null, last: PmNode | undefined): boolean {
	if (piece.kind !== 'space' || !prev?.command || !CHARACTER_WORDS.has(prev.command)) return false;
	return growsOver(piece, last);
}

/** the empty group closing a symbol macro (\ss{}) is part of what the character was written as */
function closesSymbol(im: TreeImport, piece: Piece, prev: InlinePrev | null, last: PmNode | undefined): boolean {
	if (
		!isNamed(piece, 'Group') ||
		prev?.command == null ||
		sliceOf(im, bodyOf(piece.node)).length > 0 ||
		piece.node.firstChild?.nextSibling?.name !== '}'
	)
		return false;
	return growsOver(piece, last);
}

// a group scoping a font switch ({\large ...}) must keep its braces or the switch leaks past it
export function scopesSwitch(im: TreeImport, group: SyntaxNode): boolean {
	const cursor = new PieceCursor(im.src, bodyOf(group));
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'space' || isNamed(p, 'ParBreak') || isNamed(p, 'Comment')) continue;
		return isCommand(p) && isScopedSwitch(commandName(im, p));
	}
	return false;
}

export function inlineOf(im: TreeImport, s: Stretch, ctx: ConversionContext): PmNode[] {
	const result: PmNode[] = [];
	const cursor = new PieceCursor(im.src, s);
	let prev: InlinePrev | null = null;
	for (let piece = cursor.next(); piece; piece = cursor.next()) {
		const last = result[result.length - 1];
		if (piece.kind === 'space' && (piece.eaten || last?.type.name === 'hard_break')) continue;
		const chip = groupAfterRawChip(im, piece, prev, last);
		if (chip) {
			result.push(ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip);
			prev = null;
			continue;
		}
		if (closesSymbol(im, piece, prev, last) || endsCharacterWord(piece, prev, last)) {
			prev = null;
			continue;
		}
		const call = isCommand(piece) ? readCallAt(im, cursor, piece) : null;
		const converted = call ? callInline(im, call, ctx) : pieceInline(im, piece, ctx);
		if (converted) result.push(...converted);
		prev = call ? { command: call.raw == null ? call.name : null, to: call.to } : null;
	}
	return applyLigaturesToNodes(bindTextToChips(collapseTextNodes(result)));
}

/** what a handler made of a call stands for the call's bytes wherever it did not say more itself */
function spanFromCall(nodes: PmNode[], call: Span): PmNode[] {
	for (const node of nodes) {
		const leaf = node.isText
			? node
			: node.childCount === 1 && node.firstChild!.isText
				? node.firstChild!
				: node.childCount === 0
					? node
					: null;
		if (!leaf || spansOf(leaf)) continue;
		noteSpans(leaf, standsFor(leaf.isText ? leaf.text!.length : 1, call.from, call.to));
	}
	return nodes;
}

export function callInline(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] | null {
	if (call.raw != null) return [chipOf(im, call, ctx, call.raw)];
	if (hasUnclosedGroup(call)) return [chipOf(im, call, ctx)];
	if (ignoredMacros.has(call.name)) return null;
	const handler = treeMacroHandlers.get(call.name);
	if (handler) {
		const result = handler(im, call, ctx);
		// a block made here (\includegraphics to an image) has no place in inline content, so the call stays a chip
		if (!result || result.every((n) => n.isInline)) return result && spanFromCall(result, call);
	}
	// a greedy command (\bibitem) took the \par the last save wrote, which the serializer writes again
	const text = sliceOf(im, call);
	const trimmed = text.replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
	return [chipOf(im, { from: call.from, to: call.from + trimmed.length }, ctx)];
}

/** wearing the marks around it, as a chip does: \textcolor{x}{$y$} keeps its color */
function inlineMath(im: TreeImport, node: SyntaxNode, ctx: ConversionContext): PmNode {
	const body = bodyOf(node);
	const text = sliceOf(im, body);
	const math = buildNode('inline_math', { delim: node.name === 'ParenMath' ? 'paren' : null }, [
		textNode(text, null, bytesSpan(text.length, body.from))
	]);
	return ctx.marks.length > 0 ? math.mark(realMarks(ctx.marks)) : math;
}

export function pieceInline(im: TreeImport, piece: Piece, ctx: ConversionContext): PmNode[] | null {
	const marks = ctx.marks.length > 0 ? ctx.marks : null;
	if (piece.kind === 'word') {
		const raw = sliceOf(im, piece);
		const text = ctx.marks.some((m) => m.type === 'code') ? raw : raw.replace(/~/g, '\u00a0');
		const node = sourceText(im, text, piece, ctx);
		return node ? [node] : null;
	}
	if (piece.kind === 'space') return piece.eaten ? null : textNodes(' ', marks, standsFor(1, piece.from, piece.to));
	const node = piece.node;
	const name = node.name;
	// a blank line inside an argument or a cell is a paragraph break there; inline content has none
	if (name === 'ParBreak') return textNodes(' ', marks, standsFor(1, piece.from, piece.to));
	if (BLOCK_NODES.has(name)) return [chipOf(im, piece, ctx)];
	if (INLINE_MATH.has(name)) return [inlineMath(im, node, ctx)];
	if (name === 'Group') return groupInline(im, node, ctx);
	if (name === 'OpenBracket' || name === 'CloseBracket') return textNodes(sliceOf(im, piece), marks, bytesSpan(1, piece.from));
	// a comment after something on its line lives in the bytes; one on a line of its own stays a chip
	if (name === 'Comment') return isSamelineComment(im.src, piece.from) ? null : [chipOf(im, piece, ctx)];
	return [chipOf(im, piece, ctx)];
}

function groupInline(im: TreeImport, group: SyntaxNode, ctx: ConversionContext): PmNode[] | null {
	const body = bodyOf(group);
	// exactly the pair the serializer writes for a highlight with its own color
	const pair = highlightPair(im, body);
	if (pair) return inlineOf(im, pair.text, { ...ctx, marks: [...ctx.marks, { type: 'highlight', attrs: { color: pair.color } }] });
	// a switch the group scopes, or a tabular in it (\resizebox{...}{\begin{tabular}...}), keeps the group whole
	if (scopesSwitch(im, group) || containsTabularIn(im, body)) return [chipOf(im, group, ctx)];
	const inner = inlineOf(im, body, ctx);
	// raw code in braces keeps them, as they end a command name ({\tick}COMET22); a lone accent or symbol is drawn
	const drawn = inner.length === 1 && drawnCommand(inner[0].textContent);
	return isRawOnly(inner) && !drawn ? [chipOf(im, group, ctx)] : inner;
}

function isRawOnly(nodes: PmNode[]): boolean {
	return (
		nodes.some((n) => n.type.name === 'inline_latex') &&
		nodes.every((n) => n.type.name === 'inline_latex' || n.type.name === 'hard_break' || (n.isText && !n.text!.trim()))
	);
}

/** {\sethlcolor{c}\hl{text}}, nothing else in the group */
function highlightPair(im: TreeImport, body: Stretch): { color: string; text: Stretch } | null {
	const cursor = new PieceCursor(im.src, body);
	const first = cursor.next();
	if (!first || !isCommand(first) || commandName(im, first) !== 'sethlcolor') return null;
	const set = readCallAt(im, cursor, first);
	const second = cursor.next();
	if (!second || !isCommand(second) || commandName(im, second) !== 'hl') return null;
	const hl = readCallAt(im, cursor, second);
	if (cursor.next()) return null;
	const color = argText(im.src, mandatoryArgs(set)[0]);
	const text = mandatoryArgs(hl)[0]?.body;
	return color && text ? { color, text } : null;
}
