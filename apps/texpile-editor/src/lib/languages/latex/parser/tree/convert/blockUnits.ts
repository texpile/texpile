// one block-level unit of the tree (an environment, a display, a block command) to its blocks
import type { SyntaxNode } from '@lezer/common';
import { buildNode, textNode, type ConversionContext, type PmNode } from '../../builders';
import { ignoredMacros } from '../../macros';
import { holdsMath } from '../../../knowledge/environments/envFacts';
import { tableEnvFacts } from '../../signatures/environmentFacts';
import { bytesSpan, noteSpans, spansOf, standsFor } from '$lib/editor/visual/sourceSpans';
import type { Piece } from '../walk/pieceCursor';
import { bodyOf, isUnclosed } from '../walk/stretch';
import { readEnvironment, type TreeEnvironment } from '../walk/treeEnvironment';
import { rawBlockOf, sliceOf, type TreeImport } from './treeImport';
import type { ImportCall } from './treeCalls';
import { hasUnclosedGroup } from '../walk/treeArgs';
import { treeMacroHandlers } from './macroTree';
import { environmentNameOf } from './tables/tableShapes';
import { environmentBlock } from './environments/environmentTree';
import { blocksOf } from './blocksTree';

const BLOCK_RESULTS = new Set(['heading', 'horizontal_rule', 'includedoc', 'abstract', 'image']);

export function environmentOf(im: TreeImport, node: SyntaxNode): TreeEnvironment {
	return readEnvironment(im.src, node, im.readings.environmentArgumentsOf(environmentNameOf(im, node)));
}

/** a display: \[ \], $$ $$, or a math environment */
export function isDisplay(im: TreeImport, piece: Piece): boolean {
	if (piece.kind !== 'node') return false;
	if (piece.node.name === 'DisplayMath' || piece.node.name === 'BracketMath') return true;
	return piece.node.name === 'Environment' && holdsMath(tableEnvFacts(im.readings.table, environmentNameOf(im, piece.node)));
}

/** a display holding an environment whose body is not math (a tikzcd or a tabular), which no formula field draws */
export function holdsNonMath(im: TreeImport, node: SyntaxNode): boolean {
	for (let c = node.firstChild; c; c = c.nextSibling)
		if (c.name === 'Environment' && !holdsMath(tableEnvFacts(im.readings.table, environmentNameOf(im, c)))) return true;
	return false;
}

function displayBlock(im: TreeImport, node: SyntaxNode): PmNode[] {
	if (holdsNonMath(im, node)) return [rawBlockOf(im, node)];
	const body = bodyOf(node);
	const raw = sliceOf(im, body);
	const lead = raw.length - raw.trimStart().length;
	const text = raw.trim();
	return [
		buildNode('block_math', { label: null, numbered: false, environment: null, lineLabels: [] }, [
			textNode(text, null, bytesSpan(text.length, body.from + lead))
		])
	];
}

function callBlock(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] | null {
	if (call.raw != null) return [rawBlockOf(im, call, call.raw)];
	if (hasUnclosedGroup(call)) return [rawBlockOf(im, call)];
	if (ignoredMacros.has(call.name)) return null;
	const handler = treeMacroHandlers.get(call.name);
	if (handler) {
		const result = handler(im, call, ctx);
		if (result && result.length > 0 && BLOCK_RESULTS.has(result[0].type.name)) {
			// a block that is a chip of its own (\input, \hrule) stands for the call's bytes
			for (const n of result) if (n.childCount === 0 && !spansOf(n)) noteSpans(n, standsFor(1, call.from, call.to));
			return result;
		}
	}
	const handling = im.options.unknownHandling ?? 'raw_latex';
	if (handling !== 'raw_latex') return null;
	return sliceOf(im, call).trim() ? [rawBlockOf(im, call)] : null;
}

export function blockOfUnit(im: TreeImport, piece: Piece, call: ImportCall | null, ctx: ConversionContext): PmNode[] | null {
	if (call) return callBlock(im, call, ctx);
	if (piece.kind !== 'node') return null;
	const node = piece.node;
	if (node.name === 'DisplayMath' || node.name === 'BracketMath') return displayBlock(im, node);
	if (node.name === 'Environment') {
		const env = environmentOf(im, node);
		// a \begin nothing ends, and a document the preamble split missed, stay as written around what they hold
		if (isUnclosed(node) || env.name === 'document') {
			const end = { from: env.body.to, to: env.to };
			return [
				rawBlockOf(im, { from: env.from, to: env.body.from }),
				...blocksOf(im, env.body),
				...(end.to > end.from ? [rawBlockOf(im, end)] : [])
			];
		}
		return environmentBlock(im, env, ctx);
	}
	if (node.name === 'VerbatimEnvironment') return environmentBlock(im, environmentOf(im, node), ctx);
	return [rawBlockOf(im, piece)];
}
