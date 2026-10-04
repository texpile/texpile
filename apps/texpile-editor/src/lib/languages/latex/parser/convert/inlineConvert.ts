// AST nodes to PM inline content: text, ligatures, chips, and adjacent-chip merging
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getMacroFirstArg, getTextContent, type RawStamped } from '../ast-utils';
import { buildNode, textNode, textNodes, collapseTextNodes, realMarks, type PmNode, type ConversionContext } from '../builders';
import { ignoredMacros, SCOPED_SWITCHES } from '../macros';
import { macroHandlers } from './macroHandlers';
import { schema } from '../../schema/latexPMSchema';
import { containsTabular } from './tableConvert';
import { isBlockNode } from './blockKinds';
import { capture, macroSpan, mathBodyRawSpan, nodeRawSpan, positionSpan, prefixSpans, rawTextNode, startOf } from './origCapture';
import { bindTextToChips } from './chipText';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';
import {
	alignedSpans,
	bytesSpan,
	charsOf,
	concatSpans,
	noteSpans,
	replaceKeepingSpans,
	spansOf,
	spansOfChars,
	standsFor,
	type LeafSpan
} from '$lib/editor/visual/sourceSpans';

const LIGATURES: [string, string][] = [
	['---', '—'],
	['--', '–'],
	['``', '“'],
	["''", '”'],
	['`', '‘'],
	["'", '’']
];

export function latexLigaturesToUnicode(text: string): string {
	let out = text;
	for (const [from, to] of LIGATURES) out = out.replaceAll(from, to);
	return out;
}

/** Apply ligatures to ordinary prose text nodes (not \texttt/code, where -- and `` are literal). */
export function applyLigaturesToNodes(nodes: PmNode[]): PmNode[] {
	return nodes.map((n) => {
		if (!n.isText || !n.text || n.marks.some((m) => m.type.name === 'code')) return n;
		let text = n.text;
		let chars = charsOf(text.length, spansOf(n));
		for (const [from, to] of LIGATURES) {
			if (!text.includes(from)) continue;
			({ text, chars } = replaceKeepingSpans(text, chars, from, to));
		}
		return text === n.text ? n : noteSpans(schema.text(text, n.marks), spansOfChars(chars));
	});
}

/** the bytes an AST node's own position covers, as the spans of `text` read against them */
function positionSpans(node: Node, text: string): LeafSpan[] | null {
	const p = positionSpan(node);
	return p && capture.rawSource ? alignedSpans(text, p.from, capture.rawSource.slice(p.from, p.to)) : null;
}

function chipSpans(chip: PmNode): LeafSpan[] | undefined {
	return chip.firstChild ? spansOf(chip.firstChild) : undefined;
}

/** what a handler made of a macro stands for the call's bytes wherever it did not say more itself */
function spanFromMacro(nodes: PmNode[], macro: Macro): PmNode[] {
	const span = macroSpan(macro);
	if (!span) return nodes;
	for (const node of nodes) {
		const leaf = node.isText
			? node
			: node.childCount === 1 && node.firstChild!.isText
				? node.firstChild!
				: node.childCount === 0
					? node
					: null;
		if (!leaf || spansOf(leaf)) continue;
		noteSpans(leaf, standsFor(leaf.isText ? leaf.text!.length : 1, span.from, span.to));
	}
	return nodes;
}

/**
 * A group DIRECTLY adjacent to a preceding raw chip ending in a control word is (an argument to)
 * that macro's expansion, e.g. `\rot{Finetune}` where \rot expands to \rotatebox{90}. flattening
 * the group drops its braces: the text fuses onto the control word (undefined command, fatal) or
 * the expansion grabs only the first token (silent render change). preserve the group verbatim;
 * a braced group in text mode renders identically. `prevAst` must be the LITERALLY preceding AST
 * node (any whitespace in between disqualifies adjacency).
 */
export function groupAfterRawChip(node: Node, prevAst: Node | null, lastPm: PmNode | undefined): PmNode | null {
	if (node.type !== 'group' || prevAst?.type !== 'macro') return null;
	// lexical control-word tail test on serialized chip text (no AST exists there any more). a
	// control SYMBOL counts too: the empty group of \^{} or \'{} is what keeps the accent off
	// the next letter
	if (!lastPm || lastPm.type.name !== 'inline_latex' || !/\\(?:[a-zA-Z@]+|[^a-zA-Z@\s])$/.test(lastPm.textContent)) return null;
	return buildNode('inline_latex', null, [rawTextNode(nodeRawSpan(node), printRaw(node))]);
}

// a group scoping a font switch ({\large ...}) must keep its braces or the switch leaks past it
function scopesSwitch(content: Node[]): boolean {
	const first = content.find((n) => !(n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'));
	return !!first && first.type === 'macro' && SCOPED_SWITCHES.has((first as Macro).content);
}

/** a group read through with its braces dropped that holds a block, which stands on its own once the file is written without them */
export function plainGroupHoldsBlock(node: Node): boolean {
	if (node.type !== 'group') return false;
	const content = node.content ?? [];
	if (scopesSwitch(content) || containsTabular(content)) return false;
	return content.some((n) => isBlockNode(n, true) || plainGroupHoldsBlock(n));
}

export function convertNodesToInline(nodes: Node[], ctx: ConversionContext): PmNode[] {
	const result: PmNode[] = [];
	let prevAst: Node | null = null;
	for (const node of nodes) {
		// line-wrap whitespace right after a `\\` (now a hard_break) is ignored by TeX; drop it
		// instead of carrying a stray leading space onto the next line.
		if (node.type === 'whitespace' && result[result.length - 1]?.type.name === 'hard_break') {
			prevAst = node;
			continue;
		}
		const chip = groupAfterRawChip(node, prevAst, result[result.length - 1]);
		if (chip) {
			result.push(chip);
			prevAst = node;
			continue;
		}
		if (closesSymbol(node, prevAst, result[result.length - 1]) || endsCharacterWord(node, prevAst, result[result.length - 1])) {
			prevAst = node;
			continue;
		}
		const converted = convertNodeToInline(node, ctx);
		if (converted) result.push(...converted);
		prevAst = node;
	}
	return applyLigaturesToNodes(bindTextToChips(collapseTextNodes(result)));
}

// characters written as control words, which TeX reads the space after as the end of the name
const CHARACTER_WORDS = new Set([
	'textbackslash',
	'textasciitilde',
	'textasciicircum',
	'textless',
	'textgreater',
	'textbar',
	'ldots',
	'dots',
	'textendash',
	'textemdash'
]);

/** the space after such a word is gone from the page (\textbackslash input reads \input), so it is part of the character's bytes */
export function endsCharacterWord(node: Node, prevAst: Node | null, last: PmNode | undefined): boolean {
	if (node.type !== 'whitespace' || prevAst?.type !== 'macro' || !CHARACTER_WORDS.has((prevAst as Macro).content)) return false;
	return growsOver(node, last);
}

/**
 * The empty group closing a symbol macro (`\textasciicircum{}`, `\ss{}`) is part of what the
 * character was written as: the character's bytes grow over it, so a cut after the character
 * lands after the group rather than inside the call
 */
function closesSymbol(node: Node, prevAst: Node | null, last: PmNode | undefined): boolean {
	if (node.type !== 'group' || (node.content ?? []).length > 0 || prevAst?.type !== 'macro') return false;
	return growsOver(node, last);
}

// the text before `node` takes its bytes, when that text's last run ends right where it starts
function growsOver(node: Node, last: PmNode | undefined): boolean {
	if (!last?.isText) return false;
	const at = positionSpan(node);
	const spans = spansOf(last);
	const tail = spans?.[spans.length - 1];
	if (!at || !tail || tail.srcTo !== at.from || tail.to !== last.text!.length) return false;
	noteSpans(last, [...spans!.slice(0, -1), { ...tail, srcTo: at.to, kind: 'sub' }]);
	return true;
}

export function convertNodeToInline(node: Node, ctx: ConversionContext): PmNode[] | null {
	const marks = ctx.marks.length > 0 ? ctx.marks : null;
	switch (node.type) {
		case 'string':
			if (node.content) {
				const code = ctx.marks.some((m) => m.type === 'code');
				const text = code ? node.content : node.content.replace(/~/g, ' ');
				return textNodes(text, marks, positionSpans(node, text));
			}
			return null;
		case 'whitespace':
			return textNodes(' ', marks, positionSpans(node, ' '));
		// a blank line inside an argument or a cell is a paragraph break there; inline content has
		// no paragraphs, and dropping it outright fused the words on either side
		case 'parbreak':
			return textNodes(' ', marks, positionSpans(node, ' '));
		// a whole environment where only inline content can live (a tabular, minipage or itemize
		// inside a cell or an argument): kept whole as a chip rather than dropped
		case 'environment':
		case 'mathenv':
		case 'verbatim':
		case 'displaymath': {
			const envChip = buildNode('inline_latex', null, [rawTextNode(nodeRawSpan(node), printRaw(node))]);
			return [ctx.marks.length > 0 ? envChip.mark(realMarks(ctx.marks)) : envChip];
		}
		case 'macro': {
			const macro = node as Macro;
			// a commented call captured verbatim by the heuristics: emit as-is
			const rawMacro = macro as RawStamped<Macro>;
			if (rawMacro._raw != null) {
				const raw = String(rawMacro._raw);
				return [buildNode('inline_latex', null, [textNode(raw, null, prefixSpans(raw, startOf(macro)))])];
			}
			if (ignoredMacros.has(macro.content)) return null;
			const handler = macroHandlers[macro.content];
			if (handler) {
				const result = handler(macro, ctx);
				// inline context can only host inline nodes: a handler returning a block here
				// (includegraphics -> image) falls through to the verbatim chip below instead of
				// invalid nesting the lenient builders wouldn't catch.
				if (!result || result.every((n) => n.isInline)) return result && spanFromMacro(result, macro);
			}

			// unknown macro: byte-slice when trustworthy, printRaw fallback. strip a trailing
			// \par: greedy macros (\bibitem) swallow the \par we emitted last save into their own
			// args, and left in it compounds every round-trip; the serializer re-adds exactly one.
			const raw = nodeRawSpan(macro);
			const rawLatex = (raw?.text ?? printRaw(macro)).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
			const chip = buildNode('inline_latex', null, [textNode(rawLatex, null, raw ? prefixSpans(rawLatex, raw.from) : null)]);
			// a mark from an enclosing \textbf{...} must attach to THIS chip: inline_latex is an
			// atomic leaf with no text child to carry it, so \textbf{\dataset} silently lost its
			// bold without this.
			return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
		}
		case 'group': {
			const gcontent: Node[] = node.content || [];
			// exactly the pair the serializer writes for a highlight with its own color
			const [setColor, hl] = gcontent as Macro[];
			if (
				gcontent.length === 2 &&
				setColor.type === 'macro' &&
				setColor.content === 'sethlcolor' &&
				hl.type === 'macro' &&
				hl.content === 'hl'
			) {
				const color = setColor.args?.length ? getTextContent(getMacroFirstArg(setColor)) : '';
				if (color && hl.args?.length) {
					return convertNodesToInline(getMacroFirstArg(hl), { ...ctx, marks: [...ctx.marks, { type: 'highlight', attrs: { color } }] });
				}
			}
			// the chip carries ctx.marks itself (no text child to carry a surrounding \texttt mark),
			// same reasoning as the unknown-macro chip above.
			if (scopesSwitch(gcontent)) {
				const text = printRaw(node);
				const chip = buildNode('inline_latex', null, [textNode(text, null, positionSpans(node, text))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			// a group wrapping a tabular (e.g. {\resizebox{...}{\begin{tabular}...}}) must NOT
			// flatten to inline: convertNodesToInline has no environment handler, so the WHOLE
			// table would silently drop. preserve the group verbatim; nothing is lost.
			if (containsTabular(gcontent)) {
				const text = printRaw(node);
				const chip = buildNode('inline_latex', null, [textNode(text, null, positionSpans(node, text))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			return convertNodesToInline(gcontent, ctx);
		}
		case 'inlinemath': {
			// slice the exact source between the delimiters when trustworthy; printRaw fallback
			const body = mathBodyRawSpan(node, ['$', '\\('], ['$', '\\)']);
			const mathContent = body?.text ?? printRaw(node.content || []);
			// \( \) comes back as written rather than widened to $ $
			const start = startOf(node);
			const paren = typeof start === 'number' && capture.rawSource?.startsWith('\\(', start);
			const whole = positionSpan(node);
			const spans = body ? bytesSpan(body.text.length, body.from) : whole ? standsFor(mathContent.length, whole.from, whole.to) : null;
			return [buildNode('inline_math', { delim: paren ? 'paren' : null }, [textNode(mathContent, null, spans)])];
		}
		case 'comment': {
			// a mid-paragraph comment must be kept as an inline chip: dropped from PM content it
			// survives only in the block's bytes, which regeneration doesn't consult. % consumes to
			// end of line; the SERIALIZER restores the line-ending newline for a chip starting
			// with %, so the chip's own text stays single-line - a newline baked in here rendered
			// as a bogus empty second line in the chip.
			const text = '%' + ((node as { content?: string }).content ?? '');
			return [buildNode('inline_latex', null, [textNode(text, null, prefixSpans(text, startOf(node)))])];
		}
		case 'verb': {
			// \verb<delim>content<delim> is its OWN AST node type, not 'macro', so it fell through
			// the default case and vanished. rebuild with the ORIGINAL delimiter and keep it raw
			// rather than as \texttt-with-code-mark: \verb content is truly unescaped (\, %, _, {)
			// which \texttt can't tolerate.
			const v = node as unknown as { escape?: string; content?: string; env?: string };
			const star = v.env === 'verb*' ? '*' : '';
			const text = `\\verb${star}${v.escape ?? '|'}${v.content ?? ''}${v.escape ?? '|'}`;
			const verbChip = buildNode('inline_latex', null, [textNode(text, null, prefixSpans(text, startOf(node)))]);
			return [ctx.marks.length > 0 ? verbChip.mark(realMarks(ctx.marks)) : verbChip];
		}
		default:
			return null;
	}
}

// only unmarked inline_latex is merged/promoted (marks can't live on raw_latex, and the serializer
// emits inline_latex verbatim with nothing between siblings, so concatenation is byte-neutral).
export function isInlineLatexNode(n?: PmNode): boolean {
	return !!n && n.type.name === 'inline_latex' && n.marks.length === 0;
}
export function isWhitespaceTextNode(n?: PmNode): boolean {
	return !!n && n.isText && (n.text ?? '').trim() === '';
}

// merge a maximal run of adjacent inline_latex nodes (separated only by whitespace text) into
// ONE, baking the separators in. anything else breaks the run. byte-neutral and convergent: the
// merged text re-parses to the same fragments, which re-merge identically. only code merges: a
// command the editor draws stays a chip of its own
export function mergeAdjacentInlineLatex(nodes: PmNode[]): PmNode[] {
	const out: PmNode[] = [];
	function mergeable(n?: PmNode) {
		return isInlineLatexNode(n) && !n!.textContent.startsWith('%') && !drawnCommand(n!.textContent);
	}
	let i = 0;
	while (i < nodes.length) {
		if (!mergeable(nodes[i])) {
			out.push(nodes[i]);
			i++;
			continue;
		}
		let raw = nodes[i].textContent;
		const parts = [{ len: raw.length, spans: chipSpans(nodes[i]) }];
		let j = i + 1;
		let merged = false;
		while (j < nodes.length) {
			if (mergeable(nodes[j])) {
				raw += nodes[j].textContent;
				parts.push({ len: nodes[j].textContent.length, spans: chipSpans(nodes[j]) });
				j++;
				merged = true;
			} else if (isWhitespaceTextNode(nodes[j]) && mergeable(nodes[j + 1])) {
				const space = nodes[j].text ?? '';
				raw += space + nodes[j + 1].textContent;
				parts.push(
					{ len: space.length, spans: spansOf(nodes[j]) },
					{ len: nodes[j + 1].textContent.length, spans: chipSpans(nodes[j + 1]) }
				);
				j += 2;
				merged = true;
			} else {
				break;
			}
		}
		out.push(merged ? buildNode('inline_latex', null, [textNode(raw, null, concatSpans(parts))]) : nodes[i]);
		i = j;
	}
	return out;
}

// if a paragraph is nothing but raw LaTeX (chips, hard breaks, whitespace, at least one chip and
// NO editable content) return its source so it can become one raw_latex block; else null. a `\\`
// re-parses straight back to a hard_break, so promotion is a fixed point.
export function paragraphAsRawLatex(para: PmNode): string | null {
	let out = '';
	let hasChip = false;
	let pure = true;
	para.forEach((child) => {
		if (isInlineLatexNode(child)) {
			out += child.textContent;
			// a comment chip owns its line; restore the newline its text no longer carries
			if (child.textContent.startsWith('%') && !child.textContent.endsWith('\n')) out += '\n';
			hasChip = true;
		} else if (child.type.name === 'hard_break') {
			out += '\\\\\n';
		} else if (isWhitespaceTextNode(child)) {
			out += child.text ?? '';
		} else {
			pure = false;
		}
	});
	if (!pure || !hasChip) return null;
	while (out.endsWith('\n')) out = out.slice(0, -1); // raw_latex appends its own trailing newline
	return out;
}

/** Convert a list of AST nodes into block nodes, buffering inline runs into paragraphs. */
