import { Fragment, type Node, type Mark } from 'prosemirror-model';
import { endsInComment } from '../parser/urlMask';
import { blankLineAt, createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { Ctx, NodeHandler } from '$lib/serializer/types';
import type { LatexSaveCore } from '../visual/core/plugin/latexDocumentPlugin';
import { frameHolds, nodeSaves } from '../visual/core/plugin/documentMap';
import { applyMarks } from './markWraps';
import { esc, bareTextString, joinInline, lineEnded, markableMarks, marksKey, ownLine } from './textEscapes';
import { isHandlerLeaf, mapRunLeaves, renderShadowed, shadowed, standIn } from './latexShadowRun';
import { continuesList } from './listContinuation';
import {
	displayContinues,
	displayGap,
	displayInParagraph,
	dropInnerParagraphEnds,
	dropParagraphEnd,
	isEmptyParagraph,
	isLabelOnlyParagraph,
	paragraphGap
} from './paragraphEnds';
import { endsParagraph } from './paragraphEnders';
import { guardItemBody, headsItem } from './itemLabels';
import type { Segment } from '$lib/editor/visual/sourceSpans';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
import { afterLead, BRACKET_START, guardBracket } from './lineBreaks';
import { scopeTextStyles } from './textStyles';
export { esc, sanitizeText, type EscMode } from './textEscapes';

export type { DocSerializeResult } from '$lib/serializer/blockAssembly';

/** where the leaves of a regenerated block sit in its text, or null when the shadow could not be believed */
function mapBlockLeaves(block: Node, ctx: Ctx, real: string): Segment[] | null {
	return mapRunLeaves(block, real, () => serializeNode(block, ctx));
}

/** the inline children `from` up to `to` of a textblock as one run of inline content, and where
 *  its leaves sit in it: what the segment splice writes between the bytes it keeps */
function inlineRun(block: Node, nodes: Node[]): Node {
	return block.type.create(block.attrs, Fragment.fromArray(nodes), block.marks);
}

function inlineBytes(block: Node, nodes: Node[], atStart: boolean, ctx: Ctx): string | null {
	const run = inlineRun(block, nodes);
	// a comment chip owns its line: it cannot stand mid-line between kept bytes
	let comment = false;
	run.forEach((c) => {
		if (c.type.name === 'inline_latex' && c.textContent.startsWith('%')) comment = true;
	});
	if (comment) return null;
	const bytes = afterLead(block, nodes, () => renderChildren(run, ctx.inTableCell));
	return atStart && headsItem(ctx) ? guardItemBody(bytes) : bytes;
}

function mapInlineLeaves(block: Node, nodes: Node[], text: string, _atStart: boolean, ctx: Ctx): Segment[] | null {
	const run = inlineRun(block, nodes);
	return mapRunLeaves(run, text, () => afterLead(block, nodes, () => renderChildren(run, ctx.inTableCell)));
}

/** the real and shadow runs of one block side by side, for the oracles to say why a block maps no leaves */
export function shadowRunOf(block: Node, ctx: Ctx): { real: string; shadow: string } {
	return { real: serializeNode(block, ctx), shadow: renderShadowed(() => serializeNode(block, ctx)) };
}

/** A text/leaf node's content WITHOUT its own marks, for runs wrapped once by the caller. */
function serializeBare(node: Node): string {
	if (node.isText) return bareText(node);
	const leafText = node.type.spec.leafText;
	return leafText ? lineEnded(node, shadowed(node, leafText(node))) : '';
}

function prevSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index > 0 ? ctx.parent.child(ctx.index - 1) : null;
}

function nextSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

/** Serialize a node's children, threading sibling/last-child/table context. */
export function renderChildren(node: Node, inTableCell: boolean): string {
	const children = scopeTextStyles(node.children);

	// adjacent inline children with the EXACT same marks serialize as ONE wrapped run. PM auto-
	// merges identical text nodes, but atom leaves never merge, so \texttt{A\ B} parses to three
	// same-marked nodes and would serialize as three separate \texttt{} calls: pointless churn
	// that multiplies per chip.
	let pieces: string[] = [];
	let i = 0;
	while (i < children.length) {
		const marks = markableMarks(children[i]);
		let j = i + 1;
		if (marks && marks.length > 0) {
			const key = marksKey(marks);
			while (j < children.length) {
				const nextMarks = markableMarks(children[j]);
				if (!nextMarks || marksKey(nextMarks) !== key) break;
				j++;
			}
		}
		if (j === i + 1) {
			pieces.push(serializeNode(children[i], { parent: node, index: i, isLastChild: i === children.length - 1, inTableCell }));
		} else {
			pieces.push(applyMarks(ownLine(joinInline(children.slice(i, j).map(serializeBare))), marks as readonly Mark[]));
		}
		i = j;
	}
	// a container's untouched children are written out as their bytes, joined on the file's own gaps
	if (pieces.length === children.length && children.length > 0 && children[0].isBlock)
		pieces = assembly.verbatimParts(node, dropInnerParagraphEnds(node, pieces));

	return joinInline(pieces);
}

/**
 * The label at the head of an item, and the paragraph with it removed.
 *
 * The run is identified by the item_label mark createList puts on it, not by matching text: a
 * label can span several inline nodes (`\item[A $x$ B]`), and prose that merely repeats the
 * label is not the label. `latex` is the run re-serialized, which is what an edited label has
 * to be written back as; the caller prefers the untouched source when the two still agree.
 */
function splitLeadingLabel(item: Node): { latex: string; bare: Node; body: Node; glued: boolean } | null {
	if (item.type.name !== 'paragraph') return null;
	// through the LAST marked node, not the first unmarked one
	let last = -1;
	for (let i = 0; i < item.childCount; i++) {
		const child = item.child(i);
		if (child.marks.some((m) => m.type.name === 'item_label')) last = i;
		else if (child.isText) break;
	}
	if (last < 0) return null;
	let size = 0;
	for (let i = 0; i <= last; i++) size += item.child(i).nodeSize;
	// the label's own marks are the wrapper, not content: \item[\textbf{x}] would come back
	// doubly bold otherwise
	const bare = item.type.schema.node(
		'paragraph',
		null,
		item.content
			.cut(0, size)
			.content.map((n) => standIn(n.mark(n.marks.filter((m) => m.type.name !== 'item_label' && m.type.name !== 'strong')), n))
	);
	let rest = item.content.cut(size);
	const next = rest.firstChild;
	// the body runs straight on from the bracket when no whitespace stands between them
	const glued = !!next && !(next.isText && /^\s/.test(next.text ?? ''));
	if (next?.isText && next.text && /^\s+$/.test(next.text)) rest = rest.cut(next.nodeSize);
	else if (next?.isText && next.text && /^\s/.test(next.text)) {
		const trimmed = next.text.replace(/^\s+/, '');
		rest = rest.replaceChild(0, standIn(next.type.schema.text(trimmed, next.marks), next, next.text.length - trimmed.length));
	}
	return { latex: renderChildren(bare, false).trim(), bare, body: item.copy(rest), glued };
}

// a comment on the command's own line would read back as part of it
function indentOf(node: Node, content: string): string {
	const command = node.attrs.indent === 'indent' ? '\\indent' : node.attrs.indent === 'noindent' ? '\\noindent' : '';
	return command && (content.startsWith('%') ? `${command}\n` : `${command} `);
}

function envBody(node: Node): string {
	return dropParagraphEnd(renderChildren(node, false).replace(/^\n+|\n+$/g, ''), node.lastChild) + '\n';
}

// doc assembly (verbatim substitution + per-block memo) is format-neutral and shared with the
// markdown serializer; serializeNode hoists, so binding it here is safe.
const assembly = createBlockAssembly((node, ctx) => serializeNode(node, ctx), {
	beforeBreak: (text, last, next) => dropParagraphEnd(text, last.node, last.was, next.origin ?? next.was),
	boundary: paragraphGap,
	settleGap: displayGap,
	mapLeaves: mapBlockLeaves,
	frameHolds,
	shadowChunk: (node, bytes) => shadowed(node, bytes),
	// an item's label is written with \item, by the list handler, from the run at the head of the
	// item's first block: that block cannot be rendered on its own inside the item's frame
	spliceChild: (parent, index, was) =>
		!(
			parent.type.name === 'list' &&
			(splitLeadingLabel(parent.child(index)) !== null ||
				(was !== null && splitLeadingLabel(was) !== null) ||
				(index === 0 && parent.attrs.itemLabel != null && !parent.attrs.itemCmd))
		),
	// inside a formula, a chip or a code block the text is the source; prose is escaped the way the text handler does
	leafBytes: (leaf, parent, atStart, _block, ctx) => {
		if (parent.type.spec.leafText || parent.type.spec.code) return leaf.text ?? '';
		// a label's bytes sit inside \item[..]: a `]` in them needs the whole bracket braced
		if (leaf.marks.some((m) => m.type.name === 'item_label') && (leaf.text ?? '').includes(']')) return null;
		// a bare link's text is the argument of its \url, whose bytes are the text's own run
		if (leaf.marks.some((m) => m.type.name === 'link' && m.attrs.bare)) return null;
		const bytes = bareTextString(
			leaf.text ?? '',
			leaf.marks.some((m) => m.type.name === 'code')
		);
		return atStart && headsItem(ctx) ? guardItemBody(bytes) : bytes;
	},
	inlineBytes,
	mapInlineLeaves,
	// a comment runs to the end of its line: nothing may follow it on that line
	endsLine: endsInComment,
	continues: continuesList,
	standsAlone: (parsed) => !parsed.isTextblock || splitLeadingLabel(parsed) === null,
	// a control word ending the fresh bytes would fuse with a letter beginning the kept tail, and in
	// prose line breaks meeting across the seam (a line taken out, a \\ before the file's own line
	// end) would make a blank line, a new paragraph
	keepApart: (bytes, tail, head, _gone, parent) => {
		if (!parent.type.spec.leafText && !parent.type.spec.code && blankLineAt(head, bytes, tail)) return null;
		const out = /\\[a-zA-Z@]+$/.test(bytes) && /^[a-zA-Z]/.test(tail) ? bytes + ' ' : bytes;
		return parent.type.spec.code ? out : guardBracket(head, bytes, tail, out);
	},
	// a block written afresh inside an environment or an item continues its lines as the file
	// indented the block it replaced, else under what stood before it on its first line
	continuation: (_parent, text, head) => {
		const nl = text.indexOf('\n');
		return nl >= 0 ? /^[ \t]*/.exec(text.slice(nl + 1))![0] : head.replace(/\S/g, ' ');
	},
	// the paragraphs of a table cell are joined by \par, as the cell handler writes them: a blank
	// line inside a tabular is not one
	childGap: (parent) => (parent.type.name === 'table_cell' || parent.type.name === 'table_header' ? ' \\par ' : null)
});

function serializeDocChildrenDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc, parse, afresh);
}

function serializeDocChildren(doc: Node): string {
	return serializeDocChildrenDetailed(doc).text;
}

/** The text handler's escaping, WITHOUT wrapping in the node's own marks (shared with
 * serializeBare's run merge). */
function bareText(node: Node): string {
	return shadowed(
		node,
		bareTextString(
			node.text ?? '',
			node.marks.some((m) => m.type.name === 'code')
		)
	);
}

const CORE_NODES: Record<string, NodeHandler> = {
	doc: (node) => serializeDocChildren(node),

	paragraph(node, ctx) {
		// an empty paragraph emits nothing: blank lines are semantic no-ops (WYSIWYM). a user who
		// wants real space types \vspace/\bigskip, which round-trips as a raw chip.
		if (isEmptyParagraph(node)) return '';
		// a \label on its own line is an anchor, not prose: it has no paragraph to end, so \par
		// here would add a token the source never had, on every save, after every section label
		if (isLabelOnlyParagraph(node) && !ctx.inTableCell) {
			return (prevSibling(ctx)?.type.name === 'heading' ? '' : '\n') + renderChildren(node, false).trim() + '\n';
		}
		const rawContent = renderChildren(node, ctx.inTableCell);
		// no \par inside table cells; a row opens after \\ (or \toprule), which reads a [ there as its argument
		if (ctx.inTableCell) return ctx.index === 0 && BRACKET_START.test(rawContent) ? `{}${rawContent}` : rawContent;
		// \item already opens the paragraph, so a break before it puts the body on its own line and
		// a \par after it adds a token the source never had. A second paragraph of the same item is
		// separated by the blank line the list handler puts in front of every continuation block
		if (ctx.parent?.type.name === 'list') {
			const body = rawContent.replace(/^\s+|\s+$/g, '');
			return indentOf(node, body) + body + '\n';
		}

		// trim edge whitespace: the parser re-absorbs a space before \par, so it would
		// accumulate one per save.
		const trimmed = rawContent.replace(/^\s+|\s+$/g, '');
		const content = endsInComment(trimmed) ? trimmed + '\n' : trimmed;
		const indent = indentOf(node, content);
		const prev = prevSibling(ctx);
		const next = nextSibling(ctx);
		// a display the source kept inside this paragraph: no \par before it and no blank line
		// after it, or the continuation becomes a new, indented paragraph with space above
		const runsIntoDisplay = next?.type.name === 'block_math' && displayInParagraph(next);
		const continuesDisplay = prev?.type.name === 'block_math' && displayContinues(prev);
		const before = prev?.type.name === 'heading' || continuesDisplay ? '' : '\n';
		const after = next?.type.name === 'heading' ? '\n' : '';
		if (runsIntoDisplay) return before + indent + content + '\n';
		return before + indent + content + (endsParagraph(next) ? '\n' : content.endsWith('\n') ? '\\par\n' : ' \\par\n') + after;
	},

	text(node) {
		return applyMarks(bareText(node), node.marks);
	},

	raw_latex: (node) => node.textContent + '\n',

	environment: (node) => {
		const name = String(node.attrs.name ?? 'environment');
		const args = String(node.attrs.args ?? ''); // verbatim \begin{name}<args> (e.g. "{0.5\textwidth}")
		return `\\begin{${name}}${args}\n${envBody(node)}\\end{${name}}\n`;
	}
};

const SAVE_CORE: LatexSaveCore = {
	children: renderChildren,
	node: serializeNode,
	body: envBody,
	verbatimParts: (parent, parts, opts) => assembly.verbatimParts(parent, parts, opts),
	itemLabel: splitLeadingLabel
};

/** Serialize one node. Leaves use the schema's own leafText; unknowns preserve content. */
export function serializeNode(node: Node, ctx: Ctx): string {
	// leafText atoms (inline_math, inline_latex) CAN carry marks (converter.ts attaches one when
	// an unknown macro sits inside \textbf, since there's no text node inside to carry it), so
	// wrap them the same way `text` does.
	const leafText = node.type.spec.leafText;
	if (leafText && !node.isText) {
		const text = lineEnded(node, shadowed(node, leafText(node)));
		return node.marks.length > 0 ? applyMarks(ownLine(text), node.marks) : text;
	}

	const handler = CORE_NODES[node.type.name] as NodeHandler | undefined;
	const save = handler ? null : nodeSaves.get(node.type.name);
	if (handler || save) {
		const text = handler ? handler(node, ctx) : save!(node, ctx, SAVE_CORE);
		return isHandlerLeaf(node) ? shadowed(node, text) : text;
	}

	// unknown node: preserve content rather than dropping it
	return node.isText ? esc(node.text ?? '', 'text') : renderChildren(node, ctx.inTableCell);
}

/**
 * Serialize a ProseMirror doc to a LaTeX body. trimming happens INSIDE
 * serializeDocChildrenDetailed (only at unprotected edges); an outer .trim() here would strip a
 * preserved boundary right back off.
 */
export function serializeToLatex(doc: Node): string {
	return serializeDocChildrenDetailed(doc).text;
}

/**
 * Like serializeToLatex, but also reports whether each edge is a verbatim-preserved original
 * boundary: latexRoundtrip.ts must NOT insert its own separator around a protected edge (the
 * body already carries the exact original bytes), only around a regenerated one.
 */
export function serializeToLatexDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	return serializeDocChildrenDetailed(doc, parse, afresh);
}

/** Nothing but labels (and whitespace) - the paragraph the importer makes for a \label sitting on
 *  its own line under a heading. */
