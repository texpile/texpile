/**
 * Deterministic ProseMirror to LaTeX serializer: each node/mark maps to fixed LaTeX, no rules
 * engine, styling delegated to the verbatim-preserved preamble. leaves reuse the schema's own
 * NodeSpec.leafText; everything else is a handler keyed by node.type.name; marks are open/close
 * pairs.
 */

import type { Node, Mark } from 'prosemirror-model';
import { serializeTable } from './tableSerializer';
import { FIG_IMG_SLOT, FIG_CAP_SLOT, FIG_LAB_SLOT } from '../latex-parser/converter';
import type { Ctx, NodeHandler } from './types';

const ESCAPE_RE = /[\\{}#%&$_^]/g;
const ESCAPE_MAP: Record<string, string> = {
	'\\': '\\textbackslash{}',
	'{': '\\{',
	'}': '\\}',
	'#': '\\#',
	'%': '\\%',
	'&': '\\&',
	$: '\\$',
	_: '\\_',
	'^': '\\^{}'
};

/** text-mode escaping, single pass (runs per text node on every serialization). */
export function sanitizeText(text: string): string {
	return text.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

export type EscMode = 'text' | 'href' | 'math' | 'verbatim' | 'raw';

/** The single escaper. Only `text` mutates; href/math/verbatim/raw pass through. */
export function esc(value: string, mode: EscMode = 'text'): string {
	return mode === 'text' ? sanitizeText(value) : value;
}

// em is \textit (not \emph); highlight is soul's \hl. href is NOT escaped.
const MARKS: Record<string, (attrs: Record<string, unknown>) => { open: string; close: string }> = {
	strong: () => ({ open: '\\textbf{', close: '}' }),
	em: () => ({ open: '\\textit{', close: '}' }),
	u: () => ({ open: '\\underline{', close: '}' }),
	sup: () => ({ open: '\\textsuperscript{', close: '}' }),
	sub: () => ({ open: '\\textsubscript{', close: '}' }),
	code: () => ({ open: '\\texttt{', close: '}' }),
	link: (a) => ({ open: `\\href{${String(a.href ?? '')}}{`, close: '}' }),
	textcolor: (a) => ({ open: `\\textcolor{${esc(String(a.color ?? 'black'))}}{`, close: '}' }),
	highlight: (a) => ({ open: `{\\sethlcolor{${esc(String(a.color ?? 'yellow'))}}\\hl{`, close: '}}' })
};

const SUPPRESSED_MARKS = new Set(['suggestion_insert', 'suggestion_delete']);

/** Wrap `result` in each mark's open/close pair, inner to outer. shared with non-text leaves
 * that carry marks (an unknown macro chip under \textbf has no text node to carry the bold). */
function applyMarks(result: string, marks: readonly Mark[]): string {
	for (const mark of marks) {
		if (SUPPRESSED_MARKS.has(mark.type.name)) continue;
		// a bare \url{href} parses to a link whose text IS the href; if unedited, round-trip
		// \url back instead of widening to \href{href}{href} (a visible styling change under
		// most hyperref setups). compare against the esc()'d href: `result` is already
		// text-escaped, but \url's own argument must stay RAW.
		if (mark.type.name === 'link' && mark.attrs?.bare && result === esc(String(mark.attrs.href ?? ''), 'text')) {
			result = `\\url{${String(mark.attrs.href ?? '')}}`;
			continue;
		}
		const make = MARKS[mark.type.name];
		if (!make) continue;
		const { open, close } = make(mark.attrs ?? {});
		result = open + result + close;
	}
	return result;
}

/** The marks a node's own handler wraps around it (text, and leaf atoms borrowing a mark);
 * null for anything else, which renderChildren's run-merge leaves untouched. */
function markableMarks(node: Node): readonly Mark[] | null {
	return node.isText || node.type.spec.leafText ? node.marks : null;
}

/** Order-sensitive on purpose: same set in a different order must NOT merge
 * (\textbf{\texttt{X}} vs \texttt{\textbf{X}} are different commands), so require exact match. */
function marksKey(marks: readonly Mark[]): string {
	return marks.map((m) => `${m.type.name}:${JSON.stringify(m.attrs)}`).join('|');
}

/** A text/leaf node's content WITHOUT its own marks, for runs wrapped once by the caller. */
function serializeBare(node: Node): string {
	if (node.isText) return node.marks.some((m) => m.type.name === 'suggestion_insert') ? '' : bareText(node);
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

// verbatim source preservation: the `orig` attr the importer stamps on top-level blocks
// (see ORIG_BLOCKS in schema.ts).
interface OrigAttr {
	latex?: string | null;
	norm?: string | null;
	pre?: string | null;
	seq?: number | null;
	group?: number | null;
	groupIndex?: number | null;
	groupSize?: number | null;
	/** Body-relative source offset of the block's slice. not read here; positional consumers only. */
	start?: number | null;
}

function origOf(node: Node): OrigAttr | null {
	const o = (node.attrs as { orig?: unknown }).orig;
	return o && typeof o === 'object' ? (o as OrigAttr) : null;
}

/**
 * How many children starting at `i` may be emitted verbatim: 1 for a plain block whose current
 * serialization still equals its parse-time `norm`; the whole group for a multi-block source
 * unit (one itemize is N list nodes), but only when EVERY member is present, in pristine order
 * and unchanged, so a deleted/edited item can never be resurrected. 0 means regenerate.
 */
function verbatimRun(doc: Node, parts: string[], i: number): number {
	const orig = origOf(doc.child(i));
	if (!orig || typeof orig.latex !== 'string' || typeof orig.norm !== 'string') return 0;
	if (orig.group == null) return parts[i] === orig.norm ? 1 : 0;
	const size = orig.groupSize;
	if (orig.groupIndex !== 0 || typeof size !== 'number' || size < 1 || i + size > doc.childCount) return 0;
	for (let k = 0; k < size; k++) {
		const o = origOf(doc.child(i + k));
		if (!o || o.group !== orig.group || o.groupIndex !== k || typeof o.norm !== 'string' || parts[i + k] !== o.norm) return 0;
	}
	return size;
}

interface DocTail {
	text?: string | null;
	afterSeq?: number | null;
}

function docTailOf(doc: Node): DocTail | null {
	const t = (doc.attrs as { docTail?: unknown }).docTail;
	return t && typeof t === 'object' ? (t as DocTail) : null;
}

export interface DocSerializeResult {
	text: string;
	/** True iff the leading bytes are the body's verbatim original leading gap; the caller
	 *  (latexRoundtrip.ts) must NOT prepend its own separator then, or it duplicates. */
	leadProtected: boolean;
	/** Same, for the trailing edge. */
	tailProtected: boolean;
}

/**
 * Serialize the doc's children with verbatim substitution: a block still serializing to its
 * parse-time norm re-emits its source slice; pristine neighbours (consecutive seq) re-join on
 * their original inter-block source (`pre`); every verbatim/regenerated boundary gets a hard
 * blank line so paragraphs can't merge on re-parse. with no orig attrs this equals plain
 * concatenation. also reproduces the body's leading/trailing gaps (they belong to no node) and
 * does the final trim, ONLY at edges that aren't verbatim-protected.
 */
// per-block memo. PM nodes are immutable and structurally shared across transactions, so an
// untouched top-level block keeps its object identity keystroke to keystroke: serializing the
// whole doc becomes O(edited blocks), not O(doc). a block's output depends only on itself plus
// the neighbour facts handlers read via prevSibling/nextSibling (heading adjacency for
// paragraph, type+kind for list coalescing) — captured in `key`. if a handler ever reads more
// of Ctx at the top level, widen the key.
const blockCache = new WeakMap<Node, { key: string; text: string }>();

function neighborKey(sib: Node | null): string {
	if (!sib) return '';
	return sib.type.name === 'list' ? `list:${String(sib.attrs.kind ?? '')}` : sib.type.name;
}

function serializeTopBlock(doc: Node, i: number, n: number): string {
	const node = doc.child(i);
	const key = neighborKey(i > 0 ? doc.child(i - 1) : null) + '>' + neighborKey(i < n - 1 ? doc.child(i + 1) : null);
	const hit = blockCache.get(node);
	if (hit && hit.key === key) return hit.text;
	const text = serializeNode(node, { parent: doc, index: i, isLastChild: i === n - 1, inTableCell: false });
	blockCache.set(node, { key, text });
	return text;
}

function serializeDocChildrenDetailed(doc: Node): DocSerializeResult {
	const n = doc.childCount;
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		parts.push(serializeTopBlock(doc, i, n));
	}
	let out = '';
	// seq of the last verbatim-emitted child; null once anything regenerated lands in between.
	// blocks serializing to '' (empty paragraphs) don't break the chain, so pristine neighbours
	// separated by a since-emptied paragraph still re-join on their original whitespace.
	let prevSeq: number | null = null;
	let leadProtected = false;
	let i = 0;
	while (i < n) {
		const run = verbatimRun(doc, parts, i);
		if (run > 0) {
			const orig = origOf(doc.child(i))!;
			const contiguous = prevSeq != null && orig.seq === prevSeq + 1;
			if (out === '') {
				// if the doc's first emission truly starts at pristine block 0, its `pre` IS the
				// body's original leading gap; reproduce it before the generic trim can strip it.
				if (orig.seq === 0 && typeof orig.pre === 'string') {
					out = orig.pre + orig.latex!;
					leadProtected = true;
				} else {
					out = orig.latex!;
				}
			} else if (contiguous && typeof orig.pre === 'string') {
				out += orig.pre + orig.latex;
			} else {
				// hard boundary after regenerated output: exactly one blank line (a guaranteed
				// parbreak; without it a verbatim paragraph could merge into its neighbour).
				let end = out.length;
				while (end > 0 && out[end - 1] === '\n') end--;
				out = out.slice(0, end) + '\n\n' + orig.latex;
			}
			const lastSeq = origOf(doc.child(i + run - 1))?.seq;
			prevSeq = typeof lastSeq === 'number' ? lastSeq : null;
			i += run;
		} else {
			if (parts[i] !== '') {
				out += prevSeq != null ? '\n\n' + parts[i].replace(/^\n+/, '') : parts[i];
				prevSeq = null;
			}
			i++;
		}
	}

	// the trailing gap after the ORIGINAL last block belongs to no node; reproduce it iff the
	// doc's actual last emission is still, unbroken, that same pristine block (seq match).
	let tailProtected = false;
	const docTail = docTailOf(doc);
	if (docTail && typeof docTail.text === 'string' && typeof docTail.afterSeq === 'number' && prevSeq === docTail.afterSeq) {
		out += docTail.text;
		tailProtected = true;
	}

	// trim ONLY unprotected edges (identical to a blanket .trim() when no orig/docTail data
	// exists: editor-created docs, direct converter callers).
	if (!leadProtected) out = out.replace(/^\s+/, '');
	if (!tailProtected) out = out.replace(/\s+$/, '');
	return { text: out, leadProtected, tailProtected };
}

function serializeDocChildren(doc: Node): string {
	return serializeDocChildrenDetailed(doc).text;
}

/** The text handler's escaping, WITHOUT wrapping in the node's own marks (shared with
 * serializeBare's run merge). */
function bareText(node: Node): string {
	let result = esc(node.text ?? '', 'text');
	// a pasted tab becomes one space: there's no clean tab mapping and a space is idempotent.
	// a bare " stays as-is: \texttt{"} re-parses to a code mark and compounds every save.
	result = result.replace(/\t/g, ' ');
	// a no-break space (from a ~ tie) must go back to ~, not a raw U+00A0 byte (renders
	// differently without inputenc, and is unfaithful to the source either way).
	result = result.replace(/\u00A0/g, '~');
	// typographic chars become LaTeX ligatures so the .tex stays ASCII and round-trips; skipped
	// in code, where they are literal.
	if (!node.marks.some((m) => m.type.name === 'code')) {
		result = result
			.replace(/\u2014/g, '---')
			.replace(/\u2013/g, '--')
			.replace(/\u201C/g, '``')
			.replace(/\u201D/g, "''")
			.replace(/\u2018/g, '`')
			.replace(/\u2019/g, "'");
	}
	return result;
}

const NODES: Record<string, NodeHandler> = {
	doc: (node) => serializeDocChildren(node),

	paragraph(node, ctx) {
		// an empty paragraph emits nothing: blank lines are semantic no-ops (WYSIWYM). a user who
		// wants real space types \vspace/\bigskip, which round-trips as a raw chip.
		if (isEmptyParagraph(node)) return '';
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
		// suggestion_insert suppresses the whole node
		if (node.marks.some((m) => m.type.name === 'suggestion_insert')) return '';
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
		const variant = String(node.attrs.variant ?? 'autocite');
		const pre = node.attrs.prenote ? String(node.attrs.prenote) : '';
		const post = node.attrs.postnote ? String(node.attrs.postnote) : '';
		const NO_NOTES = new Set(['supercite', 'citeauthor', 'citeyear']); // don't take [pre][post]
		if ((pre || post) && !NO_NOTES.has(variant)) return `\\${variant}[${pre}][${post}]{${key}}`;
		return `\\${variant}{${key}}`;
	},

	// preserve the original reference command so the output matches the user's preamble
	ref: (node) => `\\${String(node.attrs.command ?? 'autoref')}{${node.textContent}}`,

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
	if (leafText && !node.isText) return applyMarks(leafText(node), node.marks);

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

const DISPLAY_ENVIRONMENTS = [
	'align',
	'align*',
	'alignat',
	'alignat*',
	'equation',
	'equation*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'eqnarray',
	'eqnarray*'
];

function hasDisplayEnvironment(content: string): boolean {
	const t = content.trim();
	return DISPLAY_ENVIRONMENTS.some((env) => t.startsWith(`\\begin{${env}}`));
}

function blockMath(content: string, opts: { numbered: boolean; label?: string }): string {
	const processed = content.trim();
	if (hasDisplayEnvironment(processed)) return processed + '\n';
	if (opts.numbered && opts.label) return `\\begin{equation}\\label{${opts.label}}\n${processed}\n\\end{equation}\n`;
	if (opts.numbered) return `\\begin{equation}\n${processed}\n\\end{equation}\n`;
	return `\\[\n${processed}\n\\]\n`;
}

function extractEnvironmentContent(latex: string, envName: string): string | null {
	const pattern = new RegExp(`\\\\begin\\{${envName}\\*?\\}([\\s\\S]*)\\\\end\\{${envName}\\*?\\}`, 'i');
	const m = latex.match(pattern);
	return m ? m[1].trim() : null;
}

function alignEnvironment(content: string, opts: { environment: string; lineLabels: string[]; label?: string; numbered: boolean }): string {
	const envName = opts.numbered ? opts.environment : `${opts.environment}*`;
	let inner = extractEnvironmentContent(content, opts.environment);
	if (inner === null) inner = content.trim();
	const lines = inner.split(/\\\\(?:\s*\[.*?\])?/);
	// a trailing \\ on the last row leaves one final EMPTY split segment. left in, the re-join
	// adds a stray separator and the template's own \n compounds into a blank line inside math
	// mode, which is illegal ("Paragraph ended before \align* was complete"). drop it; the join
	// places separators only between real rows, the canonical trailing-\\-free form.
	if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
	const processed = lines.map((line, i) => {
		const t = line.trim();
		const lbl = opts.lineLabels[i] || '';
		return lbl && opts.numbered ? `${t} \\label{${lbl}}` : t;
	});
	let joined = processed.join(' \\\\\n');
	if (opts.label && opts.numbered && opts.environment === 'multline') {
		joined = joined.replace(/\n$/, '') + ` \\label{${opts.label}}`;
	}
	return `\\begin{${envName}}\n${joined}\n\\end{${envName}}\n`;
}
