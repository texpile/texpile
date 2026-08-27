// AST nodes to PM inline content: text, ligatures, chips, and adjacent-chip merging
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { type RawStamped } from '../ast-utils';
import { buildNode, textNode, textNodes, collapseTextNodes, realMarks, type PmNode, type ConversionContext } from '../builders';
import { ignoredMacros, SCOPED_SWITCHES } from '../macros';
import { macroHandlers } from './macroHandlers';
import { schema } from '../../schema/latexPMSchema';
import { containsTabular } from './tableConvert';
import { mathBodyRawSource } from './origCapture';
import { nodeRawSource } from './origCapture';

export function latexLigaturesToUnicode(text: string): string {
	return (
		text
			.replace(/---/g, '—') // em-dash
			.replace(/--/g, '–') // en-dash
			.replace(/``/g, '“')
			.replace(/''/g, '”')
			.replace(/`/g, '‘')
			.replace(/'/g, '’')
			// a bare ~ means exactly one thing in LaTeX source, so this needs no context test. the
			// macroHandlers entry keyed '~' never fired: unified-latex emits a tie as a STRING node,
			// never a macro, which is why ties reached the editor as visible tildes
			.replace(/~/g, ' ')
	);
}

/** Apply ligatures to ordinary prose text nodes (not \texttt/code, where -- and `` are literal). */
export function applyLigaturesToNodes(nodes: PmNode[]): PmNode[] {
	return nodes.map((n) =>
		n.isText && n.text && !n.marks.some((m) => m.type.name === 'code') ? schema.text(latexLigaturesToUnicode(n.text), n.marks) : n
	);
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
	// lexical control-word tail test on serialized chip text (no AST exists there any more)
	if (!lastPm || lastPm.type.name !== 'inline_latex' || !/\\[a-zA-Z@]+$/.test(lastPm.textContent)) return null;
	return buildNode('inline_latex', null, [textNode(nodeRawSource(node) ?? printRaw(node))]);
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
		const converted = convertNodeToInline(node, ctx);
		if (converted) result.push(...converted);
		prevAst = node;
	}
	return applyLigaturesToNodes(collapseTextNodes(result));
}

export function convertNodeToInline(node: Node, ctx: ConversionContext): PmNode[] | null {
	switch (node.type) {
		case 'string':
			if (node.content) {
				return textNodes(node.content, ctx.marks.length > 0 ? ctx.marks : null);
			}
			return null;
		case 'whitespace':
			return textNodes(' ', ctx.marks.length > 0 ? ctx.marks : null);
		case 'macro': {
			const macro = node as Macro;
			// a commented call captured verbatim by the heuristics: emit as-is
			const rawMacro = macro as RawStamped<Macro>;
			if (rawMacro._raw != null) return [buildNode('inline_latex', null, [textNode(String(rawMacro._raw))])];
			if (ignoredMacros.has(macro.content)) return null;
			const handler = macroHandlers[macro.content];
			if (handler) {
				const result = handler(macro, ctx);
				// inline context can only host inline nodes: a handler returning a block here
				// (includegraphics -> image) falls through to the verbatim chip below instead of
				// invalid nesting the lenient builders wouldn't catch.
				if (!result || result.every((n) => n.isInline)) return result;
			}

			// unknown macro: byte-slice when trustworthy, printRaw fallback. strip a trailing
			// \par: greedy macros (\bibitem) swallow the \par we emitted last save into their own
			// args, and left in it compounds every round-trip; the serializer re-adds exactly one.
			const rawLatex = (nodeRawSource(macro) ?? printRaw(macro)).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
			const chip = buildNode('inline_latex', null, [textNode(rawLatex)]);
			// a mark from an enclosing \textbf{...} must attach to THIS chip: inline_latex is an
			// atomic leaf with no text child to carry it, so \textbf{\dataset} silently lost its
			// bold without this.
			return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
		}
		case 'group': {
			const gcontent: Node[] = node.content || [];
			// a group scoping a font switch ({\large ...}) must keep its braces or the switch
			// leaks past it. the chip carries ctx.marks itself (no text child to carry a
			// surrounding \texttt mark), same reasoning as the unknown-macro chip above.
			const firstMeaningful = gcontent.find((n) => !(n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'));
			if (firstMeaningful && firstMeaningful.type === 'macro' && SCOPED_SWITCHES.has((firstMeaningful as Macro).content)) {
				const chip = buildNode('inline_latex', null, [textNode(printRaw(node))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			// a group wrapping a tabular (e.g. {\resizebox{...}{\begin{tabular}...}}) must NOT
			// flatten to inline: convertNodesToInline has no environment handler, so the WHOLE
			// table would silently drop. preserve the group verbatim; nothing is lost.
			if (containsTabular(gcontent)) {
				const chip = buildNode('inline_latex', null, [textNode(printRaw(node))]);
				return [ctx.marks.length > 0 ? chip.mark(realMarks(ctx.marks)) : chip];
			}
			return convertNodesToInline(gcontent, ctx);
		}
		case 'inlinemath': {
			// slice the exact source between the delimiters when trustworthy; printRaw fallback
			const mathContent = mathBodyRawSource(node, ['$', '\\('], ['$', '\\)']) ?? printRaw(node.content || []);
			return [buildNode('inline_math', null, [textNode(mathContent)])];
		}
		case 'comment': {
			// a mid-paragraph comment must be kept as an inline chip: dropped from PM content it
			// survives only in the orig slice, which regeneration doesn't consult. % consumes to
			// end of line; the SERIALIZER restores the line-ending newline for a chip starting
			// with %, so the chip's own text stays single-line - a newline baked in here rendered
			// as a bogus empty second line in the chip.
			const text = '%' + ((node as { content?: string }).content ?? '');
			return [buildNode('inline_latex', null, [textNode(text)])];
		}
		case 'verb': {
			// \verb<delim>content<delim> is its OWN AST node type, not 'macro', so it fell through
			// the default case and vanished. rebuild with the ORIGINAL delimiter and keep it raw
			// rather than as \texttt-with-code-mark: \verb content is truly unescaped (\, %, _, {)
			// which \texttt can't tolerate.
			const v = node as unknown as { escape?: string; content?: string };
			const verbChip = buildNode('inline_latex', null, [textNode(`\\verb${v.escape ?? '|'}${v.content ?? ''}${v.escape ?? '|'}`)]);
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
// merged text re-parses to the same fragments, which re-merge identically.
export function mergeAdjacentInlineLatex(nodes: PmNode[]): PmNode[] {
	const out: PmNode[] = [];
	let i = 0;
	while (i < nodes.length) {
		if (!isInlineLatexNode(nodes[i])) {
			out.push(nodes[i]);
			i++;
			continue;
		}
		let raw = nodes[i].textContent;
		let j = i + 1;
		let merged = false;
		while (j < nodes.length) {
			if (isInlineLatexNode(nodes[j])) {
				raw += nodes[j].textContent;
				j++;
				merged = true;
			} else if (isWhitespaceTextNode(nodes[j]) && isInlineLatexNode(nodes[j + 1])) {
				raw += (nodes[j].text ?? '') + nodes[j + 1].textContent;
				j += 2;
				merged = true;
			} else {
				break;
			}
		}
		out.push(merged ? buildNode('inline_latex', null, [textNode(raw)]) : nodes[i]);
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
