/**
 * Deterministic ProseMirror to LaTeX serializer: each node/mark maps to fixed LaTeX, no rules
 * engine, styling delegated to the verbatim-preserved preamble. leaves reuse the schema's own
 * NodeSpec.leafText; everything else is a handler keyed by node.type.name; marks are open/close
 * pairs.
 */

import type { Node, Mark } from 'prosemirror-model';
import { serializeTable } from './tableSerializer';
import { FIG_IMG_SLOT, FIG_CAP_SLOT, FIG_LAB_SLOT } from '../parser/converter';
import { createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { Ctx, NodeHandler } from '$lib/serializer/types';
import { esc, applyMarks, markableMarks, marksKey } from './textEscapes';
import { blockMath, alignEnvironment } from './mathBlocks';
export { esc, sanitizeText, type EscMode } from './textEscapes';

export type { DocSerializeResult } from '$lib/serializer/blockAssembly';

/** A text/leaf node's content WITHOUT its own marks, for runs wrapped once by the caller. */
function serializeBare(node: Node): string {
	if (node.isText) return bareText(node);
	const leafText = node.type.spec.leafText;
	return leafText ? leafText(node) : '';
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
	const pieces: string[] = [];
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

	let out = '';
	for (const piece of pieces) {
		// if the previous chunk ends in a control word and this one starts with a letter, direct
		// concatenation FUSES them into an undefined command (\answerYes + See = \answerYesSee;
		// happens when a separating construct didn't survive conversion). a single space restores
		// the boundary and is render-neutral: TeX eats whitespace after a control word. purely
		// lexical, runs on serialized output where no AST exists. only the tail needs testing (an
		// end-anchored regex on the whole accumulator is quadratic across pieces); 256 chars is
		// far past any real control-word length.
		if (piece && /\\[a-zA-Z@]+$/.test(out.slice(-256)) && /^[a-zA-Z]/.test(piece)) out += ' ';
		// A comment owns a WHOLE line, both ends: emitted mid-line it would swallow the rest of the
		// line, and it arrived from source on its own line (a raw '%' can only open a comment chip;
		// escaped text starts with \%). With serializeNode closing the line after the chip, comment
		// chips are a round-trip fixed point instead of degrading into strippable trailing comments.
		if (piece.startsWith('%') && out && !out.endsWith('\n')) out += '\n';
		out += piece;
	}
	return out;
}

const HEADING_CMD: Record<number, string> = {
	1: '\\section',
	2: '\\subsection',
	3: '\\subsubsection',
	4: '\\paragraph',
	5: '\\subparagraph'
};

/** Drop width=/scale=/height= entries from an \includegraphics option list (keep trim, clip, angle…). */
function stripSizeKeys(opts: string): string {
	return opts
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s && !/^(width|scale|height|totalheight)\s*=/.test(s))
		.join(', ');
}

/**
 * Rebuild the \includegraphics for an image node.
 * - resized in the editor (width/maxWidth set): emit width=<frac>\textwidth, keeping other
 *   captured options (trim/clip/angle) and replacing the original size keys.
 * - options === '': the source had no brackets, emit \includegraphics{src} verbatim.
 * - options a non-empty string: emit it verbatim.
 * - options == null (editor-created, never resized): the default width.
 */
function buildIncludegraphics(node: Node): string {
	const src = String(node.attrs.src ?? '');
	const options = node.attrs.options as string | null;
	const w = Number(node.attrs.width);
	const mw = Number(node.attrs.maxWidth);
	if (Number.isFinite(w) && Number.isFinite(mw) && mw > 0) {
		const frac = Math.round((w / mw) * 100) / 100; // resize already snaps; this guards stray values
		const rest = stripSizeKeys(typeof options === 'string' ? options : '');
		const opts = [`width=${frac}\\textwidth`, rest].filter(Boolean).join(', ');
		return `\\includegraphics[${opts}]{${src}}`;
	}
	if (options === '') return `\\includegraphics{${src}}`;
	if (typeof options === 'string') return `\\includegraphics[${options}]{${src}}`;
	return `\\includegraphics[width=0.5\\textwidth]{${src}}`;
}

// doc assembly (verbatim `orig` substitution + per-block memo) is format-neutral and shared
// with the markdown serializer; serializeNode hoists, so binding it here is safe.
const assembly = createBlockAssembly((node, ctx) => serializeNode(node, ctx));

function serializeDocChildrenDetailed(doc: Node): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc);
}

function serializeDocChildren(doc: Node): string {
	return serializeDocChildrenDetailed(doc).text;
}

/** The text handler's escaping, WITHOUT wrapping in the node's own marks (shared with
 * serializeBare's run merge). */
function bareText(node: Node): string {
	const isCode = node.marks.some((m) => m.type.name === 'code');
	let result = esc(node.text ?? '', 'text');
	// a pasted tab becomes one space: there's no clean tab mapping and a space is idempotent.
	// a bare " stays as-is: \texttt{"} re-parses to a code mark and compounds every save.
	result = result.replace(/\t/g, ' ');
	// Every tie became a no-break space on the way in, so a tilde still here is one someone typed
	// meaning the character - emitted bare it would compile to a tie and vanish from the PDF.
	// MUST run before the no-break space goes back to ~, or it would escape that one too. Code
	// keeps its literal bytes and never had the tie converted, so it is left alone.
	if (!isCode) result = result.replace(/~/g, '\\textasciitilde{}');
	// a no-break space (from a ~ tie) must go back to ~, not a raw U+00A0 byte (renders
	// differently without inputenc, and is unfaithful to the source either way).
	result = result.replace(/\u00A0/g, '~');
	// typographic chars become LaTeX ligatures so the .tex stays ASCII and round-trips; skipped
	// in code, where they are literal.
	if (!isCode) {
		result = result
			.replace(/\u2014/g, '---')
			.replace(/\u2013/g, '--')
			.replace(/\u201C/g, '``')
			.replace(/\u201D/g, "''")
			.replace(/\u2018/g, '`')
			.replace(/\u2019/g, "'")
			// \ldots reads back as U+2026, which had no way home and left a non-ASCII byte behind
			.replace(/\u2026/g, '\\ldots{}');
	}
	return result;
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

		// trim edge whitespace: the parser re-absorbs a space before \par, so it would
		// accumulate one per save.
		const content = rawContent.replace(/^\s+|\s+$/g, '');
		// first-line indent override (Tab cycles it): 'auto' emits nothing
		const indent = node.attrs.indent === 'indent' ? '\\indent ' : node.attrs.indent === 'noindent' ? '\\noindent ' : '';
		const before = prevSibling(ctx)?.type.name === 'heading' ? '' : '\n';
		const after = nextSibling(ctx)?.type.name === 'heading' ? '\n' : '';
		return before + indent + content + ' \\par\n' + after;
	},

	heading(node) {
		if (node.childCount === 0) return '';
		const text = renderChildren(node, false);
		const cmd = HEADING_CMD[Number(node.attrs.level ?? 1)] ?? '\\section';
		const star = node.attrs.numbered === false ? '*' : '';
		return `${cmd}${star}{${text}}\n`;
	},

	text(node) {
		return applyMarks(bareText(node), node.marks);
	},

	hard_break(node) {
		// legacy lineBreak:false (a blank-line gap) is a semantic no-op: emit nothing
		return node.attrs?.lineBreak === false ? '' : '\\\\\n';
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
		return blockMath(content, { numbered, label: label || undefined });
	},

	// verbatim, no escaping. env/args remember the source environment and options so
	// \begin{lstlisting}[language=Python] round-trips as itself (losing the options silently
	// drops \lstset styling).
	code_block: (node) => {
		const env = String(node.attrs.env ?? 'verbatim');
		const args = String(node.attrs.args ?? '');
		return `\\begin{${env}}${args}\n${node.textContent}\n\\end{${env}}\n\n`;
	},

	blockquote: (node) => `\\begin{quote}\n${renderChildren(node, false)}\n\\end{quote}\n`,

	raw_latex: (node) => node.textContent + '\n',

	// emit the exact include command captured at parse time, path verbatim
	includedoc: (node) => `\\${String(node.attrs.command ?? 'input')}{${String(node.attrs.path ?? '')}}\n`,

	environment: (node) => {
		const name = String(node.attrs.name ?? 'environment');
		const args = String(node.attrs.args ?? ''); // verbatim \begin{name}<args> (e.g. "{0.5\textwidth}")
		return `\\begin{${name}}${args}\n${renderChildren(node, false)}\\end{${name}}\n`;
	},

	// sourceForm remembers which shape the file used. the command form only fits a single-
	// paragraph abstract (its arg is inline); multi-paragraph auto-promotes to the env form.
	abstract: (node) => {
		const sourceForm = String(node.attrs.sourceForm ?? 'env');
		if (sourceForm === 'macro' && node.childCount === 1 && node.firstChild?.type.name === 'paragraph') {
			return `\\abstract{${renderChildren(node.firstChild, false).trimEnd()}}\n`;
		}
		return `\\begin{abstract}\n${renderChildren(node, false)}\\end{abstract}\n`;
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
		if ((pre || post) && !NO_NOTES.has(variant)) return `\\${variant}[${pre}][${post}]{${key}}`;
		return `\\${variant}{${key}}`;
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
		// \caption/\label to begin with. see the bareOriginal attr in schema.ts.
		if (node.attrs.bareOriginal) return graphics + '\n';

		// editor-created image: a standard centered figure
		const env = node.attrs.spanning === true ? 'figure*' : 'figure';
		const captionLine = caption ? caption + '\n' : '';
		const labelLine = label ? label + '\n' : '';
		return `\\begin{${env}}[h]\n\\centering\n${graphics}\n${captionLine}${labelLine}\\end{${env}}\n`;
	},

	// prosemirror-flat-list: each `list` node is ONE item; same-kind siblings coalesce.
	list(node, ctx) {
		const kind = String(node.attrs.kind ?? 'bullet');
		const env = kind === 'ordered' ? 'enumerate' : 'itemize';

		const parts: string[] = [];
		node.forEach((item, _offset, i) => {
			const inner = serializeNode(item, { parent: node, index: i, isLastChild: i === node.childCount - 1, inTableCell: ctx.inTableCell });
			if (item.type.name === 'list') {
				// only the FIRST of a run of same-kind sub-lists opens \item[]; the rest coalesce
				// into the same nested env (prevSame means no \begin), and another \item[] would
				// re-parse as an extra empty item and double every save.
				const prevChild = i > 0 ? node.child(i - 1) : null;
				const continues = prevChild?.type.name === 'list' && prevChild.attrs.kind === item.attrs.kind;
				parts.push(continues ? `\n${inner}` : `\\item[] ${inner}`);
			} else if (i === 0) parts.push(`\\item ${inner}`);
			else parts.push('\n' + inner); // continuation block within the same item
		});

		const prev = prevSibling(ctx);
		const next = nextSibling(ctx);
		const prevSame = prev?.type.name === 'list' && prev.attrs.kind === kind;
		const nextSame = next?.type.name === 'list' && next.attrs.kind === kind;

		let out = '';
		if (!prevSame) {
			out += `\n\\begin{${env}}\n`;
			// raw setup content that preceded the first \item in the source; see createList
			const preBody = typeof node.attrs.preBody === 'string' ? node.attrs.preBody : '';
			if (preBody) out += preBody + '\n';
		}
		out += parts.join('');
		if (!nextSame) out += `\n\\end{${env}}\n`;
		return out;
	},

	// table family lives in tableSerializer.ts
	table_wrapper: (node) => serializeTable(node, serializeNode),
	table: (node) => serializeTable(node, serializeNode),
	table_caption: (node) => serializeTable(node, serializeNode),
	table_notes: (node) => serializeTable(node, serializeNode),
	table_row: (node) => serializeTable(node, serializeNode),
	table_cell: (node) => serializeTable(node, serializeNode),
	table_header: (node) => serializeTable(node, serializeNode)
};

/** Serialize one node. Leaves use the schema's own leafText; unknowns preserve content. */
export function serializeNode(node: Node, ctx: Ctx): string {
	// leafText atoms (inline_math, inline_latex) CAN carry marks (converter.ts attaches one when
	// an unknown macro sits inside \textbf, since there's no text node inside to carry it), so
	// wrap them the same way `text` does.
	const leafText = node.type.spec.leafText;
	if (leafText && !node.isText) {
		const text = applyMarks(leafText(node), node.marks);
		// A comment chip owns the rest of its line: % consumes to the newline, so one is restored
		// here or the prose after the chip would be commented out. The chip's own text stays
		// single-line for display (a baked-in newline rendered as an empty second chip line).
		if (node.type.name === 'inline_latex' && text.startsWith('%') && !text.endsWith('\n')) return text + '\n';
		return text;
	}

	const handler = NODES[node.type.name];
	if (handler) return handler(node, ctx);

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
export function serializeToLatexDetailed(doc: Node): DocSerializeResult {
	return serializeDocChildrenDetailed(doc);
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
