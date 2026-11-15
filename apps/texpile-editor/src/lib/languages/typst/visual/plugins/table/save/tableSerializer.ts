// #table(...) assembly: cells, column widths, and the colspec
import { Fragment, type Node } from 'prosemirror-model';
import {
	columnWidthsOf,
	followsTracks,
	hashedCode,
	ownsLineEnd,
	parseTracks,
	toFrTracks,
	type TypstSaveCore
} from '$lib/languages/typst/visual/core/document';
import { headerRows } from '../typstHeaderRows';

/** a cell on its own, inside its row's frame: a bare [..], or table.cell(..)[..] for a merged one */
function codeOf(cell: Node): string | null {
	if (!cell.attrs.typCode || cell.childCount !== 1 || cell.child(0).childCount !== 1) return null;
	const chip = cell.child(0).child(0);
	return chip.type.name === 'inline_latex' && chip.marks.length === 0 ? chip.textContent : null;
}

function hashedCodeCell(cell: Node): Node {
	if (!cell.attrs.typCode || cell.childCount !== 1) return cell;
	const paragraph = cell.child(0);
	const inline: Node[] = [];
	paragraph.forEach((child) => {
		const code = child.type.name === 'inline_latex' ? hashedCode(child.textContent) : null;
		inline.push(code != null && code !== child.textContent ? child.copy(Fragment.from(child.type.schema.text(code))) : child);
	});
	return cell.copy(Fragment.from(paragraph.copy(Fragment.from(inline))));
}

export function cellCall(original: Node, core: TypstSaveCore): string {
	const cell = codeOf(original) == null ? hashedCodeCell(original) : original;
	const colspan = Number(cell.attrs.colspan ?? 1);
	const rowspan = Number(cell.attrs.rowspan ?? 1);
	const own = Array.isArray(cell.attrs.typCellArgs) ? cell.attrs.typCellArgs.filter((a): a is string => typeof a === 'string') : [];
	const spans = [...(colspan > 1 ? [`colspan: ${colspan}`] : []), ...(rowspan > 1 ? [`rowspan: ${rowspan}`] : []), ...own];
	const code = codeOf(cell);
	if (code != null) return spans.length ? `table.cell(${spans.join(', ')}, ${code})` : code;
	// a `[` body is fresh markup: a marker at its start would open a list or heading
	const written = cell.childCount === 1 && cell.child(0).type.name === 'paragraph' ? core.inline(cell.child(0), true) : core.blocks(cell);
	// a line break or a line comment ending the cell owns its line end: the bracket goes on the next line
	const text = ownsLineEnd(written) ? written + '\n' : written;
	return spans.length ? `table.cell(${spans.join(', ')})[${text}]` : `[${text}]`;
}

/** a row on its own, inside the table's frame: its cells joined, the line's comma left to the frame */
export function rowCells(row: Node, core: TypstSaveCore): string {
	const cells: string[] = [];
	row.forEach((cell) => cells.push(cellCall(cell, core)));
	return cells.join(', ');
}

type TableRow = { cells: Node[]; isHeader: boolean; rules: unknown };

function tableRows(node: Node): TableRow[] {
	const rows: TableRow[] = [];
	const header = headerRows(node);
	node.forEach((row, _offset, i) => {
		if (row.type.name !== 'table_row') return;
		const cells: Node[] = [];
		row.forEach((cell) => cells.push(cell));
		rows.push({ cells, isHeader: header.has(i), rules: row.attrs.typRules });
	});
	return rows;
}

// grid width, not cell count: a colspan'd cell occupies several columns, and a rowspan from an
// earlier row occupies one in every row it reaches. Both have to be counted or colspecFor
// rejects a perfectly current columns: as stale and reflows the table.
function gridWidth(rows: TableRow[]): number {
	const covered = new Map<number, number>();
	let cols = 1;
	rows.forEach((r, i) => {
		const width = r.cells.reduce((w, c) => w + Number(c.attrs.colspan ?? 1), 0) + (covered.get(i) ?? 0);
		cols = Math.max(cols, width);
		r.cells.forEach((c) => {
			const rowspan = Number(c.attrs.rowspan ?? 1);
			const colspan = Number(c.attrs.colspan ?? 1);
			for (let d = 1; d < rowspan; d++) covered.set(i + d, (covered.get(i + d) ?? 0) + colspan);
		});
	});
	return cols;
}

function columnsOf(node: Node, cols: number): string {
	// cells carry the widths their tracks gave them at open, so only widths that left the tracks are a drag
	const current = columnWidthsOf(node, cols);
	const tracks = parseTracks(node.attrs.colspec, cols);
	const dragged = tracks && followsTracks(current, tracks) ? null : toFrTracks(current);
	return dragged ?? colspecFor(node.attrs.colspec, cols);
}

// verbatim align:, under the same staleness rule as colspec - a per-column list that no
// longer matches the real column count is dropped rather than silently mis-aligned
function alignOf(node: Node, cols: number): string | null {
	const align = typeof node.attrs.typAlign === 'string' ? node.attrs.typAlign.trim() : '';
	if (!align) return null;
	const perColumn = align.startsWith('(') && align.endsWith(')') && !/[()]/.test(align.slice(1, -1));
	const count = perColumn
		? align
				.slice(1, -1)
				.split(',')
				.filter((s) => s.trim()).length
		: cols;
	return count === cols ? align : null;
}

/** what a table's source says around its cells' content: its columns:, its align: and the shape of every row */
export function tableFrame(node: Node): string {
	const rows = tableRows(node);
	const cols = gridWidth(rows);
	const shapes = rows.map(
		(r) =>
			`${r.isHeader ? 'header' : 'body'} ${asStrings(r.rules).join(' ')} ${r.cells.map((c) => `${c.attrs.colspan ?? 1}x${c.attrs.rowspan ?? 1}`).join(',')}`
	);
	return [columnsOf(node, cols), alignOf(node, cols) ?? '', ...shapes].join('\n');
}

export function tableBody(node: Node, indent: string, core: TypstSaveCore): string {
	const rows = tableRows(node);
	if (rows.length === 0) return '';
	const cols = gridWidth(rows);
	function call(cell: Node) {
		return cellCall(cell, core);
	}
	function rowLine(r: { cells: Node[] }) {
		return `  ${r.cells.map(call).join(', ')},`;
	}
	const lines = [`  columns: ${columnsOf(node, cols)},`];
	const align = alignOf(node, cols);
	if (align) lines.push(`  align: ${align},`);
	// stroke:, fill:, gutter: - verbatim, in the order they were written. No staleness rule: unlike
	// align: these are not required to be per-column, so a column add/delete cannot invalidate them
	// in a way this can detect, and dropping them would be the more destructive guess.
	for (const arg of asStrings(node.attrs.typArgs)) lines.push(argLine(`  `, arg));
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		for (const rule of asStrings(r.rules)) lines.push(argLine(`  `, rule));
		// a row whose cells are all covered by a rowspan from above contributes NO arguments. It
		// used to emit a lone `,`, which is not just a lost merge but a file typst refuses to
		// parse ("unexpected comma") - a 2x2 merge produced one every time
		if (!r.cells.length) continue;
		if (!r.isHeader) {
			lines.push(rowLine(r));
			continue;
		}
		// consecutive header rows are one table.header, wherever the run sits (typst 0.13+
		// accepts a header at any row). cellCall, not a bare [..]: a merged header cell used to
		// lose its span here, so merging two header cells came apart on the next round trip
		let j = i;
		// typst grows a header down to every row its merged cells reach, so those rows go inside it:
		// written after it, their cells would land below the header instead of beside the merge
		let reach = i;
		for (;;) {
			for (let k = i; k <= j; k++) rows[k].cells.forEach((cell) => (reach = Math.max(reach, k + Number(cell.attrs.rowspan ?? 1) - 1)));
			if (
				j + 1 < rows.length &&
				(j < reach || (rows[j + 1].isHeader && rows[j + 1].cells.length && asStrings(rows[j + 1].rules).length === 0))
			)
				j++;
			else break;
		}
		const run = rows.slice(i, j + 1).filter((h) => h.cells.length);
		if (run.length === 1) lines.push(`  table.header(${run[0].cells.map(call).join(', ')}),`);
		else
			lines.push(
				'  table.header(',
				...run.flatMap((h, k) => [
					...(k ? asStrings(h.rules).map((rule) => argLine(`    `, rule)) : []),
					`    ${h.cells.map(call).join(', ')},`
				]),
				'  ),'
			);
		i = j;
	}
	for (const rule of asStrings(node.attrs.typBottomRules)) lines.push(argLine(`  `, rule));
	return `table(\n${lines.map((l) => indent + l).join('\n')}\n${indent})`;
}

/** verbatim-source attrs (typArgs, typRules, typBottomRules) as a clean string list. Defensive
 *  because these ride through the DOM on copy/paste, where an attr can come back as anything. */
function asStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/** a comment kept among the arguments takes no comma, which would pile up inside it on every save */
function argLine(indent: string, arg: string): string {
	return /^\/\/|^\/\*[\s\S]*\*\/$/.test(arg.trim()) ? `${indent}${arg}` : `${indent}${arg},`;
}

// the columns: value as written while it still names the table's column count, else the plain count
function colspecFor(colspec: unknown, cols: number): string {
	const spec = typeof colspec === 'string' ? colspec.trim() : '';
	if (/^\d+$/.test(spec) && Number(spec) === cols) return spec;
	if (spec.startsWith('(') && spec.endsWith(')') && !/[()]/.test(spec.slice(1, -1))) {
		if (
			spec
				.slice(1, -1)
				.split(',')
				.filter((s) => s.trim()).length === cols
		)
			return spec;
	}
	return String(cols);
}
