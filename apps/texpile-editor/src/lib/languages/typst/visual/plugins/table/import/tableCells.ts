// one table cell: a content block, a bare expression, or a table.cell(..) call around either
import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	bytesSpan,
	CALL_PUNCT,
	childOf,
	children,
	noteBlockSpan,
	spansOf,
	type LeafSpan,
	type PmNode,
	type TypstImport
} from '$lib/languages/typst/visual/core/document';

/** the `table.<name>` of a `table.hline()` / `table.cell(..)[..]` call, or null if it isn't one. */
export function tableMethod(n: SyntaxNode, src: string): string | null {
	if (n.name !== 'FuncCall' || n.firstChild?.name !== 'FieldAccess') return null;
	const name = src.slice(n.firstChild.from, n.firstChild.to);
	return name.startsWith('table.') ? name : null;
}

/**
 * Table cells accept `paragraph+` and nothing else (see cellContent in schema.ts).
 *
 * The equation case is not hypothetical: an edited table re-emits a bare `$x$` cell as `[$x$]`,
 * and an equation alone in its markup comes back as DISPLAY math, which a cell cannot hold. It is
 * demoted here, carrying its verbatim `typst` attr across so it still re-emits as `$x$`. Without
 * this the table round-trips once and then builds an invalid node on the second pass. A call alone
 * in the cell (`[#sym.checkmark]`) is the same chip inline.
 *
 * Anything else block-level (a list, a quote, a nested table) has no cell representation at all,
 * and null keeps the WHOLE table a raw island rather than quietly dropping the content.
 */
function cellBlocks(im: TypstImport, blocks: PmNode[]): PmNode[] | null {
	const out: PmNode[] = [];
	for (const b of blocks) {
		if (b.type.name === 'paragraph') {
			out.push(b);
		} else if (b.type.name === 'block_math') {
			const inner: PmNode[] = [];
			b.forEach((k) => inner.push(k as PmNode));
			out.push(im.core.node('paragraph', null, [im.core.node('inline_math', null, inner)]));
		} else if (b.type.name === 'raw_latex' && !/[\r\n]/.test(b.textContent)) {
			out.push(im.core.node('paragraph', null, [codeChip(im, b.textContent, (b.firstChild && spansOf(b.firstChild)) ?? null)]));
		} else {
			return null;
		}
	}
	return im.core.ensureBlocks(out);
}

function codeChip(im: TypstImport, text: string, spans: LeafSpan[] | null): PmNode {
	return im.core.node('inline_latex', { lang: 'typst' }, im.core.texts(text, null, spans));
}

/** a bare expression standing as a cell that prints content: a string, or a call given text or content (`text("0")`,
 *  `highlight(x)[..]`). A name or a call given neither (`toprule`, `midrule()`) may be a rule, which is no cell */
function contentCall(arg: SyntaxNode): boolean {
	if (arg.name === 'Str') return true;
	if (arg.name !== 'FuncCall' || hasSyntaxError(arg)) return false;
	const args = arg.lastChild;
	return !!args && children(args).some((a) => a.name === 'ContentBlock' || a.name === 'Str' || contentCall(a));
}

/**
 * One table cell. `[content]` is the ordinary form; a bare expression is equally legal Typst and
 * shows up constantly in real tables (`$x$, [Position], [m]`), so an Equation is accepted too and
 * normalised to a one-paragraph cell. An edited table re-emits it as `[$x$]`, which Typst lays out
 * identically - and an UNEDITED one never regenerates at all, because the serializer re-emits
 * its original bytes. Other code is a chip in the cell, written back bare (typCode).
 */
export function contentBlockCell(
	im: TypstImport,
	cb: SyntaxNode,
	headerCell: boolean,
	attrs: Record<string, unknown> | null = null
): PmNode | null {
	const src = im.src;
	const type = headerCell ? 'table_header' : 'table_cell';
	const span = { srcFrom: cb.from, srcTo: cb.to, size: 1 };
	// the cell's bytes are the whole content block, brackets included: written afresh, it is one
	const inline =
		cb.name === 'Equation'
			? im.core.inline([cb], src, [])
			: cb.name === 'FuncCall'
				? im.core.element(cb, cb, src, [])
				: cb.name === 'Str'
					? im.core.string(cb, src)
					: null;
	if (inline) return noteBlockSpan(im.core.node(type, attrs, [im.core.node('paragraph', { typExpr: true }, inline)]), span);
	if (contentCall(cb)) {
		const chip = codeChip(im, src.slice(cb.from, cb.to), bytesSpan(cb.to - cb.from, cb.from));
		return noteBlockSpan(im.core.node(type, { ...attrs, typCode: true }, [im.core.node('paragraph', null, [chip])]), span);
	}
	if (cb.name !== 'ContentBlock') return null;
	const markup = childOf(cb, 'Markup');
	const blocks = markup ? im.core.noted(im.core.markup(children(markup), src)) : [];
	const body = cellBlocks(im, blocks);
	return body ? noteBlockSpan(im.core.node(type, attrs, body), span) : null;
}

/** `table.cell(colspan: 2, rowspan: 3)[body]` -> the cell plus its span; any other named argument (fill:, align:) is
 *  kept on the cell as written */
export function spannedCell(
	im: TypstImport,
	call: SyntaxNode,
	headerCell: boolean
): { cell: PmNode; colspan: number; rowspan: number } | null {
	const src = im.src;
	const args = call.firstChild?.nextSibling;
	if (!args || args.name !== 'Args') return null;
	let colspan = 1;
	let rowspan = 1;
	let body: SyntaxNode | null = null;
	const typCellArgs: string[] = [];
	for (const a of children(args).filter((c) => !CALL_PUNCT.includes(c.name))) {
		if (a.name === 'Named') {
			const ident = a.firstChild;
			const key = ident && ident.name === 'Ident' ? src.slice(ident.from, ident.to) : '';
			const value = children(a).find((c) => !['Ident', 'Colon', 'Space'].includes(c.name));
			const n = value?.name === 'Int' ? parseInt(src.slice(value.from, value.to), 10) : NaN;
			if ((key === 'colspan' || key === 'rowspan') && !(Number.isFinite(n) && n >= 1 && n <= 100)) return null;
			if (key === 'colspan') colspan = n;
			else if (key === 'rowspan') rowspan = n;
			else typCellArgs.push(src.slice(a.from, a.to));
		} else if (!body && a.name !== 'LineComment' && a.name !== 'BlockComment') {
			body = a;
		} else {
			return null; // a second positional argument is not a shape this rebuilds
		}
	}
	if (!body) return null;
	const cell = contentBlockCell(im, body, headerCell, { colspan, rowspan, colwidth: null, typCellArgs });
	// a merged cell's bytes are its whole table.cell(...) call
	return cell ? { cell: noteBlockSpan(cell, { srcFrom: call.from, srcTo: call.to, size: 1 }), colspan, rowspan } : null;
}
