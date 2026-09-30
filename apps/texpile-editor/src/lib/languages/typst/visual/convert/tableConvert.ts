// the figure/table families: #figure, #image, #table and their span/colspec plumbing.
// cells hold full markup, so this module and the markup walker in converter.ts are mutually
// recursive; ESM live bindings make the circular import safe (nothing runs at module init).
import type { SyntaxNode } from '@lezer/common';
import { buildNode, type PmNode } from './builders';
import { children, childOf, convertInline } from './inlineConvert';
import { ensureBlocks, restOnlySpace } from './converter';
import { convertMarkup, notedBlocks, type Seg } from './converter';
import { blockSpanOf, noteBlockSpan, type BlockSpan } from '$lib/editor/visual/sourceSpans';

export const ARG_PUNCT = ['LeftParen', 'RightParen', 'Comma', 'Space'];

/**
 * One table cell. `[content]` is the ordinary form; a bare expression is equally legal Typst and
 * shows up constantly in real tables (`$x$, [Position], [m]`), so an Equation is accepted too and
 * normalised to a one-paragraph cell. An edited table re-emits it as `[$x$]`, which Typst lays out
 * identically - and an UNEDITED one never regenerates at all, because the serializer re-emits
 * its original bytes.
 */
function contentBlockCell(cb: SyntaxNode, src: string, headerCell: boolean, attrs: Record<string, unknown> | null = null): PmNode | null {
	const type = headerCell ? 'table_header' : 'table_cell';
	// the cell's bytes are the whole content block, brackets included: written afresh, it is one
	if (cb.name === 'Equation')
		return noteBlockSpan(buildNode(type, attrs, [buildNode('paragraph', null, convertInline([cb], src, []))]), {
			srcFrom: cb.from,
			srcTo: cb.to,
			size: 1
		});
	if (cb.name !== 'ContentBlock') return null;
	const markup = childOf(cb, 'Markup');
	const blocks = markup ? notedBlocks(convertMarkup(children(markup), src)) : [];
	const body = cellBlocks(blocks);
	return body ? noteBlockSpan(buildNode(type, attrs, body), { srcFrom: cb.from, srcTo: cb.to, size: 1 }) : null;
}

/**
 * Table cells accept `paragraph+` and nothing else (see cellContent in schema.ts).
 *
 * The equation case is not hypothetical: an edited table re-emits a bare `$x$` cell as `[$x$]`,
 * and an equation alone in its markup comes back as DISPLAY math, which a cell cannot hold. It is
 * demoted here, carrying its verbatim `typst` attr across so it still re-emits as `$x$`. Without
 * this the table round-trips once and then builds an invalid node on the second pass.
 *
 * Anything else block-level (a list, a quote, a nested table) has no cell representation at all,
 * and null keeps the WHOLE table a raw island rather than quietly dropping the content.
 */
function cellBlocks(blocks: PmNode[]): PmNode[] | null {
	const out: PmNode[] = [];
	for (const b of blocks) {
		if (b.type.name === 'paragraph') {
			out.push(b);
		} else if (b.type.name === 'block_math') {
			const inner: PmNode[] = [];
			b.forEach((k) => inner.push(k as PmNode));
			out.push(buildNode('paragraph', null, [buildNode('inline_math', { typst: b.attrs.typst, latexOrig: b.attrs.latexOrig }, inner)]));
		} else {
			return null;
		}
	}
	return ensureBlocks(out);
}

/** the `table.<name>` of a `table.hline()` / `table.cell(..)[..]` call, or null if it isn't one. */
function tableMethod(n: SyntaxNode, src: string): string | null {
	if (n.name !== 'FuncCall' || n.firstChild?.name !== 'FieldAccess') return null;
	const name = src.slice(n.firstChild.from, n.firstChild.to);
	return name.startsWith('table.') ? name : null;
}

/** `table.cell(colspan: 2, rowspan: 3)[body]` -> the cell plus its span. Only colspan/rowspan are
 *  modelled; a cell carrying anything else (fill:, align:, inset:) is not one this can rebuild. */
function spannedCell(call: SyntaxNode, src: string, headerCell: boolean): { cell: PmNode; colspan: number; rowspan: number } | null {
	const args = call.firstChild?.nextSibling;
	if (!args || args.name !== 'Args') return null;
	let colspan = 1;
	let rowspan = 1;
	let body: SyntaxNode | null = null;
	for (const a of children(args).filter((c) => !ARG_PUNCT.includes(c.name))) {
		if (a.name === 'Named') {
			const ident = a.firstChild;
			const key = ident && ident.name === 'Ident' ? src.slice(ident.from, ident.to) : '';
			const value = children(a).find((c) => !['Ident', 'Colon', 'Space'].includes(c.name));
			if (!value || value.name !== 'Int') return null;
			const n = parseInt(src.slice(value.from, value.to), 10);
			if (!Number.isFinite(n) || n < 1 || n > 100) return null;
			if (key === 'colspan') colspan = n;
			else if (key === 'rowspan') rowspan = n;
			else return null;
		} else if (!body) {
			body = a;
		} else {
			return null; // a second positional argument is not a shape this rebuilds
		}
	}
	if (!body) return null;
	const cell = contentBlockCell(body, src, headerCell, { colspan, rowspan, colwidth: null });
	// a merged cell's bytes are its whole table.cell(...) call
	return cell ? { cell: noteBlockSpan(cell, { srcFrom: call.from, srcTo: call.to, size: 1 }), colspan, rowspan } : null;
}

/** `columns: 3` or `columns: (auto, 1fr, ...)` -> how many columns the cell stream wraps at. */
function columnCount(value: SyntaxNode, src: string): number | null {
	if (value.name === 'Int') {
		const n = parseInt(src.slice(value.from, value.to), 10);
		return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
	}
	if (value.name === 'Array') {
		const elems = children(value).filter((c) => !ARG_PUNCT.includes(c.name));
		return elems.length > 0 ? elems.length : null;
	}
	return null;
}

export type TableParts = {
	/** the columns: value, verbatim, so track sizes (auto, 1fr, 2cm) survive round trips */
	colspec: string;
	/** the align: value, verbatim, when the source had one */
	align: string | null;
	/** every other named argument (stroke:, fill:, gutter:), verbatim and in source order */
	extraArgs: string[];
	/** the table.hline() calls sitting above row i, verbatim */
	rowRules: string[][];
	/** the table.hline() calls after the last row */
	bottomRules: string[];
	/** header rows hold table_header cells, wherever table.header(...) sat in the stream */
	rows: PmNode[][];
};

/**
 * The editable-grid subset: `#table(columns: ..., [cell], ...)`, plus the parts a real table
 * actually uses - any named arguments (kept verbatim), `table.header(...)`, `table.hline()` at row
 * boundaries, `table.cell(colspan:/rowspan:)` and bare expression cells like `$x$`.
 *
 * What still stays a raw island: `table.vline` / `table.footer` (no row model for them), an hline
 * in the MIDDLE of a row, a `table.cell` carrying anything beyond colspan/rowspan, and a cell
 * stream that overflows its declared column count. The serializer has to be able to rebuild
 * whatever is accepted here, so anything it cannot re-emit must not be accepted.
 */
export function tableParts(call: SyntaxNode, src: string): TableParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'table') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	const real = children(args).filter((c) => !ARG_PUNCT.includes(c.name));
	const colArg = real[0];
	if (!colArg || colArg.name !== 'Named') return null;
	const cIdent = colArg.firstChild;
	if (!cIdent || cIdent.name !== 'Ident' || src.slice(cIdent.from, cIdent.to) !== 'columns') return null;
	const value = children(colArg).find((c) => !['Ident', 'Colon', 'Space'].includes(c.name));
	if (!value) return null;
	const colsFound = columnCount(value, src);
	if (colsFound == null) return null;
	// re-bound as a plain number so hoisted helpers keep the narrowing
	const cols: number = colsFound;

	// the remaining named arguments, in source order. align: is pulled out because it carries a
	// per-column staleness rule the serializer enforces; the rest only have to survive.
	let idx = 1;
	let align: string | null = null;
	const extraArgs: string[] = [];
	for (; idx < real.length && real[idx].name === 'Named'; idx++) {
		const a = real[idx];
		const aIdent = a.firstChild;
		const key = aIdent && aIdent.name === 'Ident' ? src.slice(aIdent.from, aIdent.to) : '';
		if (key === 'columns') return null; // a second columns: is not a shape this rebuilds
		if (key === 'align' && align == null) {
			const aValue = children(a).find((c) => !['Ident', 'Colon', 'Space'].includes(c.name));
			if (!aValue || !['Array', 'Ident', 'FieldAccess'].includes(aValue.name)) return null;
			align = src.slice(aValue.from, aValue.to);
		} else {
			extraArgs.push(src.slice(a.from, a.to));
		}
	}

	// Walk the flat cell stream into a grid. `covered` marks the positions a rowspan from an
	// EARLIER row owns - within-row colspans are handled by advancing the cursor instead, so a
	// row's width stays sum(colspan) + covered, with nothing counted twice. `table.header(...)`
	// is walked through the same grid: it may sit at any row boundary and span several rows
	// (a merged header cell may also reach down into the body), and its cells are header cells.
	const covered = new Set<string>();
	function at(rr: number, cc: number) {
		return `${rr},${cc}`;
	}
	const rows: PmNode[][] = [];
	const rowRules: string[][] = [];
	let pending: string[] = [];
	let r = 0;
	let c = 0;
	function advance() {
		for (;;) {
			while (c < cols && covered.has(at(r, c))) c++;
			if (c < cols) return;
			r++;
			c = 0;
		}
	}
	/** hlines and headers only have a place in a row model at a row boundary */
	function atRowBoundary(): boolean {
		if (c !== 0 && c < cols) return false;
		if (c >= cols) {
			r++;
			c = 0;
		}
		return true;
	}
	function place(item: SyntaxNode, headerCell: boolean): boolean {
		const method = tableMethod(item, src);
		if (method && method !== 'table.cell') return false;
		const span = method === 'table.cell' ? spannedCell(item, src, headerCell) : null;
		if (method === 'table.cell' && !span) return false;
		const cell = span ? span.cell : contentBlockCell(item, src, headerCell);
		if (!cell) return false;
		const colspan = span?.colspan ?? 1;
		const rowspan = span?.rowspan ?? 1;
		advance();
		if (c + colspan > cols) return false; // the cell overruns the declared grid
		while (rows.length <= r) {
			rows.push([]);
			rowRules.push([]);
		}
		if (pending.length) {
			rowRules[r].push(...pending);
			pending = [];
		}
		rows[r].push(cell);
		for (let dr = 1; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) covered.add(at(r + dr, c + dc));
		c += colspan;
		return true;
	}

	for (; idx < real.length; idx++) {
		const item = real[idx];
		const method = tableMethod(item, src);
		if (method === 'table.hline') {
			if (!atRowBoundary()) return null;
			pending.push(src.slice(item.from, item.to));
			continue;
		}
		if (method === 'table.header') {
			if (!atRowBoundary()) return null;
			const hArgs = item.firstChild!.nextSibling;
			if (!hArgs || hArgs.name !== 'Args') return null;
			for (const cell of children(hArgs).filter((h) => !ARG_PUNCT.includes(h.name))) if (!place(cell, true)) return null;
			// a short header is padded out to the grid (the editor's rows are rectangular)
			while (c > 0 && c < cols) {
				if (!covered.has(at(r, c))) rows[r].push(buildNode('table_header', null, [buildNode('paragraph')]));
				c++;
			}
			continue;
		}
		if (!place(item, false)) return null;
	}
	if (rows.length === 0) return null;

	// pad the last row so the grid stays rectangular (PM tables need it; typst tolerates it)
	const lastRow = rows.length - 1;
	if (lastRow >= 0) {
		let width = rows[lastRow].reduce((w, cell) => w + Number(cell.attrs.colspan ?? 1), 0);
		for (let cc = 0; cc < cols; cc++) if (covered.has(at(lastRow, cc))) width++;
		while (width < cols) {
			rows[lastRow].push(buildNode('table_cell', null, [buildNode('paragraph')]));
			width++;
		}
	}
	return { colspec: src.slice(value.from, value.to), align, extraArgs, rowRules, bottomRules: pending, rows };
}

export function buildTableNode(t: TableParts): PmNode | null {
	const rowNodes: PmNode[] = [];
	t.rows.forEach((cells, i) => {
		const row = buildNode('table_row', { topRules: '', typRules: t.rowRules[i] ?? [] }, cells);
		// the row's bytes: from its first cell's to its last, when every cell is the file's own
		const placed = cells.map((c) => blockSpanOf(c)).filter((s): s is BlockSpan => !!s);
		rowNodes.push(
			placed.length > 0 && placed.length === cells.length
				? noteBlockSpan(row, {
						srcFrom: Math.min(...placed.map((s) => s.srcFrom)),
						srcTo: Math.max(...placed.map((s) => s.srcTo)),
						size: 1
					})
				: row
		);
	});
	if (rowNodes.length === 0) return null;
	return buildNode(
		'table',
		{ env: null, colspec: t.colspec, typAlign: t.align, typArgs: t.extraArgs, typBottomRules: t.bottomRules },
		rowNodes
	);
}
/** a `#table(...)` standing alone in its paragraph becomes a real, editable table node. */
export function tableSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	if (!call || !restOnlySpace(kids, i + 2)) return null;
	const t = tableParts(call, src);
	if (!t) return null;
	const node = buildTableNode(t);
	if (!node) return null;
	return { seg: { blocks: [node], from: hash.from, to: call.to }, next: i + 2 };
}

/** `#quote(block: true)[...]` standing alone becomes a blockquote; any other quote stays raw. */
