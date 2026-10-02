/**
 * Deterministic ProseMirror to LaTeX serializer: each node/mark maps to fixed LaTeX, no rules
 * engine, styling delegated to the verbatim-preserved preamble. leaves reuse the schema's own
 * NodeSpec.leafText; everything else is a handler keyed by node.type.name; marks are open/close
 * pairs.
 */

import { Fragment, type Node, type Mark } from 'prosemirror-model';
import { serializeTable, serializeRowCells, serializeCell } from './tableSerializer';
import { FIG_IMG_SLOT, FIG_CAP_SLOT, FIG_LAB_SLOT } from '../parser/converter';
import { blankLineAt, createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { Ctx, NodeHandler } from '$lib/serializer/types';
import { esc, applyMarks, bareTextString, joinInline, markableMarks, marksKey } from './textEscapes';
import { blockMath, alignEnvironment } from './mathBlocks';
import { isHandlerLeaf, mapRunLeaves, renderShadowed, shadowed, standIn, withoutShadow } from './latexShadowRun';
import { buildIncludegraphics } from './includegraphics';
import { continuesList, opensItsSourceList, runEnvName } from './listContinuation';
import { dropParagraphEnd, paragraphGap } from './paragraphEnds';
import { guardItemBody, headsItem, labelKey } from './itemLabels';
import type { Segment } from '$lib/editor/visual/sourceSpans';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
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
	const bytes = renderChildren(run, ctx.inTableCell);
	return atStart && headsItem(ctx) ? guardItemBody(bytes) : bytes;
}

function mapInlineLeaves(block: Node, nodes: Node[], text: string, _atStart: boolean, ctx: Ctx): Segment[] | null {
	const run = inlineRun(block, nodes);
	return mapRunLeaves(run, text, () => renderChildren(run, ctx.inTableCell));
}

/** the real and shadow runs of one block side by side, for the oracles to say why a block maps no leaves */
export function shadowRunOf(block: Node, ctx: Ctx): { real: string; shadow: string } {
	return { real: serializeNode(block, ctx), shadow: renderShadowed(() => serializeNode(block, ctx)) };
}

/** A text/leaf node's content WITHOUT its own marks, for runs wrapped once by the caller. */
function serializeBare(node: Node): string {
	if (node.isText) return bareText(node);
	const leafText = node.type.spec.leafText;
	return leafText ? shadowed(node, leafText(node)) : '';
}

function prevSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index > 0 ? ctx.parent.child(ctx.index - 1) : null;
}

function nextSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

/** Serialize a node's children, threading sibling/last-child/table context. */
export function renderChildren(node: Node, inTableCell: boolean): string {
	const children: Node[] = [];
	node.forEach((child) => children.push(child));

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
			let inner = '';
			for (let k = i; k < j; k++) inner += serializeBare(children[k]);
			pieces.push(applyMarks(inner, marks as readonly Mark[]));
		}
		i = j;
	}
	// a container's untouched children are written out as their bytes, joined on the file's own gaps
	if (pieces.length === children.length && children.length > 0 && children[0].isBlock) pieces = assembly.verbatimParts(node, pieces);

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

const HEADING_CMD: Record<number, string> = {
	1: '\\section',
	2: '\\subsection',
	3: '\\subsubsection',
	4: '\\paragraph',
	5: '\\subparagraph'
};

function envBody(node: Node): string {
	return dropParagraphEnd(renderChildren(node, false).replace(/^\n+|\n+$/g, ''), node.lastChild) + '\n';
}

// doc assembly (verbatim substitution + per-block memo) is format-neutral and shared with the
// markdown serializer; serializeNode hoists, so binding it here is safe.
const assembly = createBlockAssembly((node, ctx) => serializeNode(node, ctx), {
	beforeBreak: (text, last, next) => dropParagraphEnd(text, last.node, last.was, next.origin ?? next.was),
	boundary: paragraphGap,
	mapLeaves: mapBlockLeaves,
	shadowChunk: (node, bytes) => shadowed(node, bytes),
	// an item's label is written with \item, by the list handler, from the run at the head of the
	// item's first block: that block cannot be rendered on its own inside the item's frame
	spliceChild: (parent, index, was) =>
		!(
			parent.type.name === 'list' &&
			(splitLeadingLabel(parent.child(index)) !== null ||
				(was !== null && splitLeadingLabel(was) !== null) ||
				(index === 0 && parent.attrs.itemLabel != null))
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
	endsLine: (text) => /(^|[^\\])(\\\\)*%[^\n]*$/.test(text),
	continues: continuesList,
	standsAlone: (parsed) => !parsed.isTextblock || splitLeadingLabel(parsed) === null,
	// a control word ending the fresh bytes would fuse with a letter beginning the kept tail, and in
	// prose line breaks meeting across the seam (a line taken out, a \\ before the file's own line
	// end) would make a blank line, a new paragraph
	keepApart: (bytes, tail, head, _gone, parent) => {
		if (!parent.type.spec.leafText && !parent.type.spec.code && blankLineAt(head, bytes, tail)) return null;
		return /\\[a-zA-Z@]+$/.test(bytes) && /^[a-zA-Z]/.test(tail) ? bytes + ' ' : bytes;
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

const NODES: Record<string, NodeHandler> = {
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
		if (ctx.inTableCell) return rawContent; // no \par inside table cells
		// \item already opens the paragraph, so a break before it puts the body on its own line and
		// a \par after it adds a token the source never had. A second paragraph of the same item is
		// separated by the blank line the list handler puts in front of every continuation block
		if (ctx.parent?.type.name === 'list') return rawContent.replace(/^\s+|\s+$/g, '') + '\n';

		// trim edge whitespace: the parser re-absorbs a space before \par, so it would
		// accumulate one per save.
		const trimmed = rawContent.replace(/^\s+|\s+$/g, '');
		const content = /(^|[^\\])(\\\\)*%[^\n]*$/.test(trimmed) ? trimmed + '\n' : trimmed;
		// first-line indent override (Tab cycles it): 'auto' emits nothing
		const indent = node.attrs.indent === 'indent' ? '\\indent ' : node.attrs.indent === 'noindent' ? '\\noindent ' : '';
		const prev = prevSibling(ctx);
		const next = nextSibling(ctx);
		// a display the source kept inside this paragraph: no \par before it and no blank line
		// after it, or the continuation becomes a new, indented paragraph with space above
		const runsIntoDisplay = next?.type.name === 'block_math' && next.attrs.inParagraph === true;
		const continuesDisplay = prev?.type.name === 'block_math' && prev.attrs.continuesAfter === true;
		const before = prev?.type.name === 'heading' || continuesDisplay ? '' : '\n';
		const after = next?.type.name === 'heading' ? '\n' : '';
		if (runsIntoDisplay) return before + indent + content + '\n';
		// an environment, a list or a display ends the paragraph itself: no \par of its own before
		// one, as the file had none when the two stood on a single line end
		const endsItself =
			!!next && ['list', 'environment', 'block_math', 'table_wrapper', 'image', 'code_block', 'abstract'].includes(next.type.name);
		return before + indent + content + (endsItself ? '\n' : ' \\par\n') + after;
	},

	heading(node) {
		if (node.childCount === 0) return '';
		const text = renderChildren(node, false);
		// \chapter and \part have no level of their own in the editor; the source command is kept
		const cmd =
			typeof node.attrs.command === 'string' && node.attrs.command
				? `\\${node.attrs.command}`
				: (HEADING_CMD[Number(node.attrs.level ?? 1)] ?? '\\section');
		const star = node.attrs.numbered === false ? '*' : '';
		// a `]` inside the short title would close the optional argument early; bracing the whole
		// argument is how LaTeX carries one
		const shortTitle = typeof node.attrs.shortTitle === 'string' ? node.attrs.shortTitle : '';
		const short = shortTitle ? `[${shortTitle.includes(']') ? `{${shortTitle}}` : shortTitle}]` : '';
		return `${cmd}${star}${short}{${text}}\n`;
	},

	text(node) {
		return applyMarks(bareText(node), node.marks);
	},

	hard_break(node, ctx) {
		// legacy lineBreak:false (a blank-line gap) is a semantic no-op: emit nothing
		if (node.attrs?.lineBreak === false) return '';
		const suffix = typeof node.attrs?.suffix === 'string' ? node.attrs.suffix : '';
		if (node.attrs?.command === 'newline' || (ctx.inTableCell && !suffix)) return '\\newline\n';
		return `\\\\${suffix}\n`;
	},

	block_math(node) {
		const content = node.textContent;
		const numbered = Boolean(node.attrs.numbered ?? false);
		const label = (node.attrs.label as string) || '';
		const environment = (node.attrs.environment as string | null) ?? null;
		const lineLabels = (node.attrs.lineLabels as string[]) ?? [];
		if (environment) {
			return alignEnvironment(content, { environment, lineLabels, label: label || undefined, numbered });
		}
		return blockMath(content, { numbered, label: label || undefined, starredEnv: node.attrs.starredEnv === true });
	},

	// verbatim, no escaping. env/args remember the source environment and options so
	// \begin{lstlisting}[language=Python] round-trips as itself (losing the options silently
	// drops \lstset styling).
	code_block: (node) => {
		const env = String(node.attrs.env ?? 'verbatim');
		const args = String(node.attrs.args ?? '');
		return `\\begin{${env}}${args}\n${node.textContent}\n\\end{${env}}\n\n`;
	},

	blockquote: (node) => {
		const env = node.attrs.env === 'quotation' ? 'quotation' : 'quote';
		return `\\begin{${env}}\n${envBody(node)}\\end{${env}}\n`;
	},

	raw_latex: (node) => node.textContent + '\n',

	// emit the exact include command captured at parse time, path verbatim
	includedoc: (node) => `\\${String(node.attrs.command ?? 'input')}{${String(node.attrs.path ?? '')}}\n`,

	environment: (node) => {
		const name = String(node.attrs.name ?? 'environment');
		const args = String(node.attrs.args ?? ''); // verbatim \begin{name}<args> (e.g. "{0.5\textwidth}")
		return `\\begin{${name}}${args}\n${envBody(node)}\\end{${name}}\n`;
	},

	// sourceForm remembers which shape the file used. the command form only fits a single-
	// paragraph abstract (its arg is inline); multi-paragraph auto-promotes to the env form.
	abstract: (node) => {
		const sourceForm = String(node.attrs.sourceForm ?? 'env');
		if (sourceForm === 'macro' && node.childCount === 1 && node.firstChild?.type.name === 'paragraph') {
			return `\\abstract{${renderChildren(node.firstChild, false).trimEnd()}}\n`;
		}
		return `\\begin{abstract}\n${envBody(node)}\\end{abstract}\n`;
	},

	horizontal_rule: () => '\\par\\noindent\\rule{\\linewidth}{0.4pt}\n',

	// pre/post notes are NOT text-escaped: they come from getTextContent, which falls back to a
	// macro's raw source (a \eg shorthand pre-note), and escaping would mangle it into
	// \textbackslash{}eg. a 'string' AST node never contains an unescaped special to begin with.
	citation(node) {
		const key = node.textContent;
		const variant = String(node.attrs.variant ?? 'cite');
		const pre = node.attrs.prenote ? String(node.attrs.prenote) : '';
		const post = node.attrs.postnote ? String(node.attrs.postnote) : '';
		const NO_NOTES = new Set(['supercite', 'citeauthor', 'citeyear']); // don't take [pre][post]
		if (NO_NOTES.has(variant) || (!pre && !post)) return `\\${variant}{${key}}`;
		// one bracket is the postnote for natbib, biblatex and plain \cite alike; only a prenote
		// needs the two-bracket form, which plain LaTeX's \cite does not understand
		if (!pre) return `\\${variant}[${post}]{${key}}`;
		return `\\${variant}[${pre}][${post}]{${key}}`;
	},

	// preserve the original reference command so the output matches the user's preamble
	ref: (node) => `\\${String(node.attrs.command ?? 'ref')}{${node.textContent}}`,

	// back exactly where it stood: a \label names whichever counter was last incremented, so its
	// position IS its meaning, and moving it would silently repoint it
	label: (node) => `\\label{${String(node.attrs.name ?? '')}}`,

	image(node) {
		const numbered = node.attrs.numbered !== false;
		const showCaption = node.attrs.showCaption !== false;
		const graphics = buildIncludegraphics(node);
		const capContent = renderChildren(node, false);
		// verbatim short-caption \caption[short]{long}; see the captionOpt attr in schema.ts
		const capOpt = typeof node.attrs.captionOpt === 'string' && node.attrs.captionOpt ? `[${node.attrs.captionOpt}]` : '';
		const caption = showCaption ? `\\caption${numbered ? '' : '*'}${capOpt}{${capContent}}` : '';
		const labelText = numbered && showCaption ? String(node.attrs.label ?? '') : '';
		const label = labelText ? `\\label{${labelText}}` : '';

		// imported figure: substitute the editable bits back into the verbatim float template so
		// all surrounding scaffolding (centerline, vspace, captionsetup, placement) is preserved.
		const template = node.attrs.figureTemplate as string | null;
		if (typeof template === 'string' && template) {
			let out = template.split(FIG_IMG_SLOT).join(graphics).split(FIG_CAP_SLOT).join(caption).split(FIG_LAB_SLOT).join(label);
			// a caption added in the editor to a figure that had none has no slot to fill; drop
			// it in just before \end{figure}.
			if (showCaption && capContent && !template.includes(FIG_CAP_SLOT)) {
				out = out.replace(/(\n?)(\\end\{figure\*?\})\s*$/, `\n${caption}\n$2`);
			}
			return out.replace(/\s*$/, '') + '\n';
		}

		// a \includegraphics that was standalone in the source round-trips bare: synthesizing a
		// \begin{figure} is often a compile error (nested floats), and this image never had a
		// \caption/\label to begin with. see the bareOriginal attr in schema.ts. A caption typed
		// in the editor since needs a float to live in, so that one does get the figure below
		if (node.attrs.bareOriginal && !(showCaption && capContent.trim())) return graphics + '\n';

		// editor-created image: a standard centered figure
		const env = node.attrs.spanning === true ? 'figure*' : 'figure';
		const captionLine = caption ? caption + '\n' : '';
		const labelLine = label ? label + '\n' : '';
		return `\\begin{${env}}[h]\n\\centering\n${graphics}\n${captionLine}${labelLine}\\end{${env}}\n`;
	},

	// prosemirror-flat-list: each `list` node is ONE item; same-kind siblings coalesce.
	list(node, ctx) {
		const kind = String(node.attrs.kind ?? 'bullet');
		const defaultEnv = kind === 'ordered' ? 'enumerate' : 'itemize';
		// a description environment is remembered on the run's first node; the rest inherit it. A
		// node naming an environment of its own opens a new run: a description after an itemize
		// is not its continuation, whatever the kinds say
		const envName = runEnvName(node, ctx);
		const env = envName ?? defaultEnv;
		const prevSame = !!ctx.parent && continuesList(ctx.parent, ctx.index);
		const nextSame = !!ctx.parent && !!nextSibling(ctx) && continuesList(ctx.parent, ctx.index + 1);
		// \item[label]: the editor shows it as leading bold text, so it is taken back out of the
		// body before the bracket is rewritten. The SOURCE label is preferred while the run still
		// says the same thing, since re-serializing turns a tie into a no-break space and a `--`
		// into a dash; once the run says something else, the user edited the label and that wins
		const itemLabel = typeof node.attrs.itemLabel === 'string' ? node.attrs.itemLabel : null;
		// the block carrying the label: the first, unless a line break at its start left empty
		// paragraphs in front of it, which \item writes as nothing. Read with the shadow off: the label
		// is compared with the source's by its words
		let first = 0;
		const labelled = withoutShadow(() => {
			while (first < node.childCount - 1 && isEmptyParagraph(node.child(first)) && splitLeadingLabel(node.child(first + 1)) !== null)
				first++;
			return node.childCount > 0 ? splitLeadingLabel(node.child(first)) : null;
		});
		const sourceHolds = itemLabel != null && labelled != null && labelKey(labelled.latex) === labelKey(itemLabel);
		const said = labelled ? (sourceHolds ? itemLabel : labelled.latex) : itemLabel === '' ? '' : null;
		// written through the shadow when that writes the same bytes, so a run can tell where the label's words went
		const label = labelled && said === labelled.latex ? renderChildren(labelled.bare, false).trim() : said;
		// a `]` in the label would close the bracket early: braces around it keep it inside
		const bracketed = said != null && said.includes(']') && !/^\{[^]*\}$/.test(said) ? `{${label}}` : label;
		const itemCmd = label == null ? '\\item' : `\\item[${bracketed}]`;

		// an item's untouched blocks are written out as their bytes; the labelled first block is shown
		// without its label, so it is always rendered afresh
		const inners: string[] = [];
		node.forEach((item, _offset, i) => {
			const shown = i === first && labelled ? labelled.body : item;
			inners.push(serializeNode(shown, { parent: node, index: i, isLastChild: i === node.childCount - 1, inTableCell: ctx.inTableCell }));
		});
		const rendered = assembly.verbatimParts(node, inners, { join: false, keep: (i) => i === first && !!labelled });
		const parts: string[] = [];
		node.forEach((item, _offset, i) => {
			const inner = rendered[i];
			if (i < first) return;
			if (item.type.name === 'list') {
				// only the FIRST of a run of same-kind sub-lists opens \item[]; the rest coalesce
				// into the same nested env (prevSame means no \begin), and another \item[] would
				// re-parse as an extra empty item and double every save.
				const prevChild = i > 0 ? node.child(i - 1) : null;
				const continues = prevChild?.type.name === 'list' && prevChild.attrs.kind === item.attrs.kind;
				// a sub-list under the item's OWN body needs no \item[]: that item is already open, and
				// the break the nested env opens with would put a blank line between the two
				const afterBody = !!prevChild && prevChild.type.name !== 'list';
				parts.push(continues ? `\n${inner}` : afterBody ? inner.replace(/^\n/, '') : `\\item[] ${inner}`);
			} else if (i === first) {
				const alone = labelled && !inner.trim() && node.childCount > first + 1 && node.child(first + 1).type.name !== 'list';
				parts.push(alone ? `${itemCmd} \\par` : `${itemCmd}${labelled?.glued ? '' : ' '}${guardItemBody(inner)}`);
			} else parts.push('\n' + inner); // continuation block within the same item
		});

		let out = '';
		if (!prevSame) {
			const own = opensItsSourceList(node, ctx.parent);
			// enumitem-style options the source gave the environment; see createList
			const envArgs = own && typeof node.attrs.envArgs === 'string' ? node.attrs.envArgs : '';
			out += `\n\\begin{${env}}${envArgs}\n`;
			// raw setup content that preceded the first \item in the source; see createList
			const preBody = own && typeof node.attrs.preBody === 'string' ? node.attrs.preBody : '';
			if (preBody) out += preBody + '\n';
		}
		out += parts.join('');
		// an item body already ends its line, so a break of our own would open a blank one above \end
		if (!nextSame) out += `${out.endsWith('\n') ? '' : '\n'}\\end{${env}}\n`;
		return out;
	},

	// table family lives in tableSerializer.ts
	table_wrapper: (node) => serializeTable(node, serializeNode),
	table: (node) => serializeTable(node, serializeNode),
	table_caption: (node) => serializeTable(node, serializeNode),
	table_notes: (node) => serializeTable(node, serializeNode),
	table_row: (node, ctx) => serializeRowCells(node, ctx.parent?.type.name === 'table' ? ctx.parent : null, serializeNode),
	table_cell: (node, ctx) => serializeCell(node, ctx.index === 0, serializeNode),
	table_header: (node) => serializeTable(node, serializeNode)
};

/** Serialize one node. Leaves use the schema's own leafText; unknowns preserve content. */
export function serializeNode(node: Node, ctx: Ctx): string {
	// leafText atoms (inline_math, inline_latex) CAN carry marks (converter.ts attaches one when
	// an unknown macro sits inside \textbf, since there's no text node inside to carry it), so
	// wrap them the same way `text` does.
	const leafText = node.type.spec.leafText;
	if (leafText && !node.isText) {
		const text = applyMarks(shadowed(node, leafText(node)), node.marks);
		// A comment chip owns the rest of its line: % consumes to the newline, so one is restored
		// here or the prose after the chip would be commented out. The chip's own text stays
		// single-line for display (a baked-in newline rendered as an empty second chip line).
		if (node.type.name === 'inline_latex' && text.startsWith('%') && !text.endsWith('\n')) return text + '\n';
		return text;
	}

	const handler = NODES[node.type.name];
	if (handler) {
		const text = handler(node, ctx);
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
function isLabelOnlyParagraph(node: Node): boolean {
	let sawLabel = false;
	let sawOther = false;
	node.forEach((c) => {
		if (c.type.name === 'label') sawLabel = true;
		else if (c.isText) sawOther ||= (c.text ?? '').trim() !== '';
		else sawOther = true;
	});
	return sawLabel && !sawOther;
}

function isEmptyParagraph(node: Node): boolean {
	if (node.childCount === 0) return true;
	let empty = true;
	node.forEach((c) => {
		if (c.isText) {
			if (c.text && c.text.trim() !== '') empty = false;
		} else if (c.type.name !== 'hard_break') {
			empty = false;
		}
	});
	return empty;
}
