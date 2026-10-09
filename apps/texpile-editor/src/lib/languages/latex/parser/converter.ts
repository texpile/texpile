// unified-latex AST to ProseMirror Nodes.
import type { Node, Root, Macro, Environment } from '@unified-latex/unified-latex-types';
// don't use toString from unified-latex-util-to-string: it uses Prettier, which is async in v3
import { parseLatex } from './parser';
import { maskUrlSpecials, unmaskUrlSpecials } from './urlMask';
import type { ParseOptions } from './types';
import { listNewcommands } from '@unified-latex/unified-latex-util-macros';
import { attachMacroArgs } from '@unified-latex/unified-latex-util-arguments';
import { mergeAdjacentRawBlocks } from '$lib/editor/visual/mergeRawBlocks';
import { buildNode, textNode, createDefaultContext, collapseTextNodes, type PmNode, type PmMark, type ConversionOptions } from './builders';

import { MACRO_SIGNATURES, ENV_SIGNATURES, stripSamelineComments, type SameLineCommented } from './macros';
import {
	heuristicMarkCommentedMacroCalls,
	heuristicMarkTexPrimitiveDefs,
	heuristicMarkDelimitedMacroSpans,
	heuristicInferUnknownMacroSignatures,
	heuristicGlueBareFileArgs
} from './heuristics';

export type { PmNode, PmMark, ConversionOptions };

import { capture, extentOf, nodeExtent, repairExtentTail, prefixSpans, startOf, type CaptureState } from './convert/origCapture';
import { blockSpanOf, collectMap, noteBlockSpan } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap } from '$lib/editor/visual/parseOrigins';
import { macroHandlers } from './convert/macroHandlers';
import { TABLE_RULE_MACROS } from './convert/tableConvert';
import { isBlockNode } from './convert/blockKinds';
import { scanPreambleText } from './convert/preambleScan';
import { convertNodeToBlock } from './convert/blockConvert';
import {
	applyLigaturesToNodes,
	endsCharacterWord,
	groupAfterRawChip,
	convertNodeToInline,
	mergeAdjacentInlineLatex,
	paragraphAsRawLatex,
	plainGroupHoldsBlock
} from './convert/inlineConvert';
import { bindTextToChips } from './convert/chipText';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';
export { FIG_IMG_SLOT, FIG_CAP_SLOT, FIG_LAB_SLOT } from './convert/figureConvert';
export { convertNodeToInline } from './convert/inlineConvert';

// verbatim source capture: the TOP-LEVEL convertNodesToBlocks pass notes on every block it can
// place the bytes it came from (a block span, see sourceSpans). parseLatexFile turns the spans
// into the parse's origins; the serializer writes an untouched block back as those bytes. armed
// by latexToProseMirror, consumed (grab-and-null) by the first convertNodesToBlocks call, so
// recursive calls never capture.

/** capture for a nested pass: the same source, the blocks placed from the first positioned node on.
 *  Positions a nested walk synthesizes read back as 0, which the floor rejects */
function nestedCapture(nodes: Node[]): CaptureState | null {
	if (!capture.rawSource) return null;
	let floor = Infinity;
	for (const n of nodes) {
		const at = startOf(n);
		if (typeof at === 'number' && at >= 0 && at < floor) floor = at;
	}
	return { source: capture.rawSource, prevEnd: Number.isFinite(floor) ? floor : 0 };
}

export function convertNodesToBlocks(nodes: Node[], options: ConversionOptions): PmNode[] {
	// verbatim source capture: the top-level call takes the armed state (grab-and-null; see
	// above), a nested call (an environment's body, a list item) captures its own blocks the same way
	const cap = capture.pending ?? nestedCapture(nodes);
	capture.pending = null;
	const result: PmNode[] = [];
	const ctx = createDefaultContext();
	let currentParagraphContent: PmNode[] = [];
	// source extent of the paragraph currently accumulating (top-level capture only)
	let paraExt: { min: number; max: number } | null = null;
	function extendPara(node: Node) {
		if (!cap) return;
		if (!paraExt) paraExt = { min: Infinity, max: -Infinity };
		const ext = extentOf(node, cap.prevEnd);
		paraExt.min = Math.min(paraExt.min, ext.min);
		paraExt.max = Math.max(paraExt.max, ext.max);
		// an attached-arg macro's closing delimiter has no positioned node; reclaim it from the
		// source or the block's span loses its final closer(s). see repairExtentTail.
		if ((node as Macro).args?.length) {
			const own = repairExtentTail(node, nodeExtent(node, cap.prevEnd));
			if (own && Number.isFinite(own.max) && own.max > paraExt.max) paraExt.max = own.max;
		}
	}

	// note-and-push for top-level blocks. ext null = no trustworthy span: the block is pushed
	// unplaced, and the gap before its neighbour can never bridge it. a multi-block result from ONE
	// source construct is noted as one span on its first block; the serializer substitutes it only
	// when the whole construct is present, ordered and unchanged.
	//
	// advanceExt controls ONLY how far cap.prevEnd moves, separate from ext. all callers pass
	// them equal today, but the invariant is subtle: if a block ever gets ext=null while
	// consuming source, prevEnd MUST still advance past it, or the NEXT block's span could start
	// before the skipped bytes while its regenerated form is ALSO emitted.
	function pushBlocks(blocks: PmNode[], ext: { min: number; max: number } | null, advanceExt: { min: number; max: number } | null = ext) {
		if (!cap || blocks.length === 0) {
			result.push(...blocks);
			return;
		}
		const spanOk = ext != null && Number.isFinite(ext.min) && ext.min >= cap.prevEnd && ext.max <= cap.source.length && ext.min < ext.max;
		if (construct) {
			result.push(...blocks);
			if (ext && Number.isFinite(ext.max)) construct.max = Math.max(construct.max, ext.max);
		} else if (spanOk) {
			result.push(noteBlockSpan(blocks[0], { srcFrom: ext!.min, srcTo: ext!.max, size: blocks.length }), ...blocks.slice(1));
		} else {
			result.push(...blocks);
		}
		if (advanceExt && Number.isFinite(advanceExt.max)) cap.prevEnd = Math.max(cap.prevEnd, advanceExt.max);
	}

	// a plain group holding a block (a display) is read as the file reads once its braces go: the
	// block stands on its own. the paragraph it sits in is then one construct, so an edit anywhere in
	// it writes the whole of it and one brace never goes without the other
	let seq = nodes;
	let ni = 0;
	let construct: { from: number; min: number; max: number; prevEnd: number; until: number } | null = null;
	function openConstruct(group: Node, length: number) {
		if (!cap) return;
		const ext = extentOf(group, cap.prevEnd);
		if (construct) {
			construct.max = Math.max(construct.max, ext.max);
			construct.until = ni < construct.until ? construct.until + length - 1 : ni + length;
			return;
		}
		construct = {
			from: result.length,
			min: Math.min(paraExt?.min ?? Infinity, ext.min),
			max: ext.max,
			prevEnd: cap.prevEnd,
			until: ni + length
		};
	}
	function closeConstruct() {
		const c = construct!;
		construct = null;
		if (!cap) return;
		const after = cap.prevEnd;
		cap.prevEnd = c.prevEnd;
		pushBlocks(result.splice(c.from), { min: c.min, max: c.max });
		cap.prevEnd = Math.max(after, cap.prevEnd);
	}
	// deferred inter-word whitespace: held and only emitted (as one space) once real content
	// follows, so boundary whitespace (leading/trailing, e.g. the newline after \section{...})
	// is dropped at the AST level and never becomes an insignificant space.
	let pendingWhitespace: Node | null = null;
	// a leading \indent / \noindent sets the upcoming paragraph's first-line indent (Tab cycles it)
	let pendingIndent: 'auto' | 'indent' | 'noindent' = 'auto';

	function flushParagraph() {
		pendingWhitespace = null; // a trailing deferred space is dropped at the boundary
		currentParagraphContent = bindTextToChips(collapseTextNodes(currentParagraphContent));
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
			pushBlocks([buildNode('paragraph', pendingIndent !== 'auto' ? { indent: pendingIndent } : null, currentParagraphContent)], paraExt);
		}
		paraExt = null;
		pendingIndent = 'auto';
		currentParagraphContent = [];
		if (construct && ni >= construct.until) closeConstruct();
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
	for (ni = 0; ni < seq.length; ni++) {
		const node = seq[ni];
		if (isBlockNode(node, currentParagraphContent.length > 0)) {
			// a display with prose buffered before it and no blank line sits inside that paragraph;
			// whether the paragraph goes on after it is decided by what follows before a blank line
			const display = node.type === 'displaymath' || node.type === 'mathenv';
			const inParagraph = display && currentParagraphContent.length > 0;
			let continuesAfter = false;
			if (display) {
				for (let k = ni + 1; k < seq.length; k++) {
					const nx = seq[k];
					if (nx.type === 'whitespace' || nx.type === 'comment') continue;
					continuesAfter = nx.type !== 'parbreak' && !isBlockNode(nx, true);
					break;
				}
			}
			flushParagraph();
			let blockNodes = convertNodeToBlock(node, ctx, options);
			if (blockNodes && display && (inParagraph || continuesAfter)) {
				blockNodes = blockNodes.map((b) =>
					b.type.name === 'block_math' ? b.type.create({ ...b.attrs, inParagraph, continuesAfter }, b.content, b.marks) : b
				);
			}
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
					const commented = cap ? withSameLineComment(node, blockNodes, cap.source) : null;
					if (commented) pushBlocks(commented.blocks, commented.ext);
					else pushBlocks(blockNodes, repairExtentTail(node, nodeExtent(node, cap?.prevEnd ?? 0)));
				}
			}
		} else if (node.type === 'parbreak' || (node.type === 'macro' && (node as Macro).content === 'par')) {
			// \par macros flush like parbreaks. a literal \par terminating a paragraph belongs
			// INSIDE that paragraph's span: in the inter-block gap it would drop at EOF, and the
			// first save wouldn't be a byte fixed point. blank-line parbreaks stay in the gap.
			if (node.type === 'macro' && currentParagraphContent.length > 0) extendPara(node);
			flushParagraph();
		} else if (node.type === 'whitespace') {
			if (endsCharacterWord(node, prevNode, currentParagraphContent[currentParagraphContent.length - 1])) extendPara(node);
			// hold the space; leading (nothing buffered) drops outright, trailing is discarded at flush
			else if (currentParagraphContent.length > 0) pendingWhitespace = node;
		} else if (node.type === 'comment' && currentParagraphContent.length === 0) {
			// a standalone comment at a block boundary becomes its own raw block. with prose
			// already buffered it falls through (TeX's % doesn't break a paragraph, so block-
			// ifying it would split the paragraph).
			const text = '%' + ((node as { content?: string }).content ?? '');
			pushBlocks(
				[buildNode('raw_latex', null, [textNode(text, null, prefixSpans(text, startOf(node)))])],
				nodeExtent(node, cap?.prevEnd ?? 0)
			);
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
			// a group directly adjacent to a raw macro chip keeps its braces (groupAfterRawChip)
			const chip = groupAfterRawChip(node, prevNode, currentParagraphContent[currentParagraphContent.length - 1]);
			if (!chip && plainGroupHoldsBlock(node)) {
				const content = node.content as Node[];
				openConstruct(node, content.length);
				seq = [...seq.slice(0, ni), ...content, ...seq.slice(ni + 1)];
				ni--;
				continue;
			}
			// extend the span over every node reaching inline conversion, even ones converting to
			// nothing: re-parsing the slice drops them identically, the original bytes survive.
			extendPara(node);
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
	if (result.length === 0) result.push(buildNode('paragraph'));
	// a container whose ENTIRE content is one all-raw paragraph collapses to a single raw_latex
	// block: a wall of adjacent inline chips can't be selected/edited as a unit. sole-block only,
	// so a caption/label paragraph beside a table stays an editable paragraph.
	const sole = result.length === 1 && result[0].type.name === 'paragraph' ? result[0] : null;
	const raw = sole ? paragraphAsRawLatex(sole) : null;
	if (raw !== null) {
		// the promoted block covers exactly the paragraph's source, so its span transfers
		const span = blockSpanOf(sole!);
		return [noteBlockSpan(buildNode('raw_latex', null, [textNode(raw, null, prefixSpans(raw, span?.srcFrom))]), span)];
	}
	return result;
}

/** a comment typed at the end of a raw chip stays in the chip, or it reopens after it and the save check sees a change */
function withSameLineComment(node: Node, blocks: PmNode[], source: string): { blocks: PmNode[]; ext: { min: number; max: number } } | null {
	const comment = (node as SameLineCommented)._sameLineComment;
	if (!comment || blocks.length !== 1 || blocks[0].type.name !== 'raw_latex') return null;
	const start = startOf(node);
	const end = (comment as { position?: { end?: { offset?: number } } }).position?.end?.offset;
	const chip = blocks[0].textContent;
	if (start == null || end == null || source.slice(start, start + chip.length) !== chip) return null;
	const text = source.slice(start, end).replace(/\r?\n$/, '');
	if (!text.startsWith(chip) || !/^\s*%/.test(text.slice(chip.length))) return null;
	return {
		blocks: [buildNode('raw_latex', blocks[0].attrs, [textNode(text, null, prefixSpans(text, start))])],
		ext: { min: start, max: start + text.length }
	};
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

// cross-file macros defined in an include reach a file only as preamble TEXT (projectMacros +
// preamble, can be hundreds of KB), so it gets its own parse. one parse feeds BOTH consumers
// (the \def-family walk and listNewcommands), and the derived outputs are memoized: the exact
// same scan string arrives on every reparse (mode switch, reload), and re-parsing it twice per
// call dominated large projects. single slot, latest wins; a timed-out worker is rebooted,
// which clears it for free.
export function latexToProseMirror(latex: string, options: ConversionOptions = {}): { doc: PmNode; ast: Root } {
	const parseOptions: ParseOptions = { macros: MACRO_SIGNATURES, environments: ENV_SIGNATURES };

	const ast = parseLatex(maskUrlSpecials(latex), parseOptions);
	unmaskUrlSpecials(ast);
	// the sync unified-latex parse above is the single longest step and reports nothing while it
	// runs; everything after it is ours, so this is the one honest boundary to announce
	options.onPhase?.('building');

	// capture commented frontmatter calls verbatim BEFORE comments are stripped. "known" =
	// registered signature, handler, table rule, or indent/noindent. TABLE_RULE_MACROS matters:
	// pandas-style tables start a header row with an empty group after \toprule, and arity
	// inference then attached a bogus arg at EVERY rule site ("Misplaced \noalign").
	// indent/noindent are zero-arg but handled by a direct content check, never via
	// macroHandlers, so inference attached the next brace group as an "argument" that its own
	// handling never reads, and the group silently vanished.
	function heuristicKnows(name: string) {
		return (
			!!parseOptions.macros?.[name] || name in macroHandlers || TABLE_RULE_MACROS.has(name) || name === 'indent' || name === 'noindent'
		);
	}
	heuristicMarkCommentedMacroCalls(ast.content as Node[], latex, heuristicKnows);

	// keep-as-raw fallback for \def/\let-family primitives. the walk also harvests delimited-
	// parameter pairs (\def\bea#1\eea{...} gives bea->eea) from the AST tokens it consumes: a
	// definition merely quoted inside verbatim/comment can never register.
	const delimPairs = new Map<string, string>();
	heuristicMarkTexPrimitiveDefs(ast.content as Node[], latex, delimPairs);

	// cross-file pairs come from the shared preamble scan (see scanPreambleText)
	const preScan = options.preamble ? scanPreambleText(options.preamble, parseOptions) : null;
	if (preScan) for (const [name, delim] of preScan.delimPairs) delimPairs.set(name, delim);

	// a \def with a delimited parameter tells us \bea swallows everything up to \eea, typically
	// math the prose path would text-escape into invalid LaTeX. must run after
	// heuristicMarkTexPrimitiveDefs so only real call sites remain visible.
	heuristicMarkDelimitedMacroSpans(ast.content as Node[], latex, delimPairs);

	// `\input name.tex` without braces names the whole file, not the token the parser took
	heuristicGlueBareFileArgs(ast.content as Node[], latex);

	// drop trailing comments so a command's args can attach across them (see fn comment)
	stripSamelineComments(ast.content as Node[]);

	// signatures for user-defined commands so their args stay attached. three sources, in
	// priority order:
	const macroInfo: Record<string, { signature: string }> = {};
	//  1. \newcommand/\renewcommand/... in the body
	for (const m of listNewcommands(ast)) macroInfo[m.name] = { signature: m.signature };
	//  2. \newcommand/... in the preamble (the parser only gets the body), via the shared scan
	if (preScan) {
		for (const m of preScan.newcommands) {
			if (!macroInfo[m.name]) macroInfo[m.name] = { signature: m.signature };
		}
	}
	//  3. heuristic: infer an unknown command's arity from usage so the args don't flatten
	Object.assign(macroInfo, heuristicInferUnknownMacroSignatures(ast, heuristicKnows, macroInfo));

	if (Object.keys(macroInfo).length > 0) {
		attachMacroArgs(ast, macroInfo);
	}

	const content = extractContent(ast);

	// arm verbatim source capture for the top-level pass (parseLatexFile turns the spans into the
	// parse's origins with their bytes; a direct converter user's document always regenerates, but
	// still knows which blocks were neighbours and which came from one construct). also arm
	// the byte-faithful raw fallback; unlike capture.pending it must stay live through every
	// nested call, hence try/finally.
	capture.pending = { source: latex, prevEnd: 0 };
	capture.rawSource = latex;
	let blocks: PmNode[];
	try {
		blocks = convertNodesToBlocks(content, options);
	} finally {
		capture.rawSource = null;
		capture.pending = null; // normally already consumed; clear defensively for error paths
	}

	const doc = mergeAdjacentRawBlocks(buildNode('doc', null, blocks.length > 0 ? blocks : [buildNode('paragraph')]), latex, drawnCommand);
	// the document knows its blocks' gaps and constructs from here; parseLatexFile registers it
	// against the file, where the bytes are written back from
	rememberParseMap(doc, collectMap(doc), { text: latex, from: 0, to: latex.length }, false);

	return { doc, ast };
}
