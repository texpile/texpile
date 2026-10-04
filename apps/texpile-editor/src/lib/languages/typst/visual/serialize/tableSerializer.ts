// #table(...) assembly: cells, column widths, and the colspec
import type { Node } from 'prosemirror-model';
import { renderInline } from './typstInline';
import { ownsLineEnd } from './envSerializer';
import { parseTracks, distribute, toFrTracks } from './tracks';

/** a cell on its own, inside its row's frame: a bare [..], or table.cell(..)[..] for a merged one */
export function cellCall(cell: Node, renderBlocks: (parent: Node) => string): string {
	const colspan = Number(cell.attrs.colspan ?? 1);
	const rowspan = Number(cell.attrs.rowspan ?? 1);
	const spans = [...(colspan > 1 ? [`colspan: ${colspan}`] : []), ...(rowspan > 1 ? [`rowspan: ${rowspan}`] : [])];
	// a `[` body is fresh markup: a marker at its start would open a list or heading
	const written = cell.childCount === 1 && cell.child(0).type.name === 'paragraph' ? renderInline(cell.child(0), true) : renderBlocks(cell);
	// a line break or a line comment ending the cell owns its line end: the bracket goes on the next line
	const text = ownsLineEnd(written) ? written + '\n' : written;
	return spans.length ? `table.cell(${spans.join(', ')})[${text}]` : `[${text}]`;
}

/** a row on its own, inside the table's frame: its cells joined, the line's comma left to the frame */
export function rowCells(row: Node, renderBlocks: (parent: Node) => string): string {
	const cells: string[] = [];
	row.forEach((cell) => cells.push(cellCall(cell, renderBlocks)));
	return cells.join(', ');
}

type TableRow = { cells: Node[]; isHeader: boolean; rules: unknown };

function tableRows(node: Node): TableRow[] {
	const rows: TableRow[] = [];
	node.forEach((row) => {
		if (row.type.name !== 'table_row') return;
		const cells: Node[] = [];
		let isHeader = row.childCount > 0;
		row.forEach((cell) => {
			if (cell.type.name !== 'table_header') isHeader = false;
			cells.push(cell);
		});
		rows.push({ cells, isHeader, rules: row.attrs.typRules });
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

function columnsOf(node: Node, rows: TableRow[], cols: number): string {
	// A drag is detected as "the cells no longer agree with the colspec". Parsing sets colwidth from
	// the source's own tracks, so the presence of a width proves nothing on its own - without this
	// comparison a table that merely HAD `(auto, 1fr)` would get its tracks rewritten the moment
	// anything else about it changed, and a stale colspec would be rebuilt from stale widths.
	// A spec that cannot describe the current column count is no baseline at all: it is stale, and
	// colspecFor's own fallback takes over.
	const current = columnWidths(rows, cols);
	const tracks = parseTracks(node.attrs.colspec, cols);
	// the widths the colspec itself implies, spent over the same total the cells were measured
	// against, so "did the user drag" is a comparison of like with like
	const measured = current.reduce<number>((a, w) => a + (w ?? 0), 0);
	const baseline = tracks && measured > 0 ? distribute(tracks, measured) : null;
	const dragged = baseline
		? current.some((w, i) => Math.abs((w ?? 0) - (baseline[i] ?? 0)) > 1)
			? toFrTracks(current)
			: null
		: tracks
			? null
			: toFrTracks(current);
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
	return [columnsOf(node, rows, cols), alignOf(node, cols) ?? '', ...shapes].join('\n');
}

export function tableBody(node: Node, indent: string, renderBlocks: (parent: Node) => string): string {
	const rows = tableRows(node);
	if (rows.length === 0) return '';
	const cols = gridWidth(rows);
	function call(cell: Node) {
		return cellCall(cell, renderBlocks);
	}
	function rowLine(r: { cells: Node[] }) {
		return `  ${r.cells.map(call).join(', ')},`;
	}
	const lines = [`  columns: ${columnsOf(node, rows, cols)},`];
	const align = alignOf(node, cols);
	if (align) lines.push(`  align: ${align},`);
	// stroke:, fill:, gutter: - verbatim, in the order they were written. No staleness rule: unlike
	// align: these are not required to be per-column, so a column add/delete cannot invalidate them
	// in a way this can detect, and dropping them would be the more destructive guess.
	for (const arg of asStrings(node.attrs.typArgs)) lines.push(`  ${arg},`);
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		for (const rule of asStrings(r.rules)) lines.push(`  ${rule},`);
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
		while (j + 1 < rows.length && rows[j + 1].isHeader && rows[j + 1].cells.length && asStrings(rows[j + 1].rules).length === 0) j++;
		const run = rows.slice(i, j + 1);
		if (run.length === 1) lines.push(`  table.header(${run[0].cells.map(call).join(', ')}),`);
		else lines.push('  table.header(', ...run.map((h) => `    ${h.cells.map(call).join(', ')},`), '  ),');
		i = j;
	}
	for (const rule of asStrings(node.attrs.typBottomRules)) lines.push(`  ${rule},`);
	return `table(\n${lines.map((l) => indent + l).join('\n')}\n${indent})`;
}

/** verbatim-source attrs (typArgs, typRules, typBottomRules) as a clean string list. Defensive
 *  because these ride through the DOM on copy/paste, where an attr can come back as anything. */
function asStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/** The verbatim columns: value, but ONLY while it still matches the table's real column count —
 *  a context-menu column add/delete outdates it, and a wrong count silently reflows every cell
 *  in the compiled document. The fallback is the plain count (all-auto tracks). */
/**
 * Per-column widths, read off the cells the way prosemirror-tables stores them: `colwidth` is an
 * array with one entry per column the cell spans, or null when that column was never sized.
 * Occupancy is walked so a colspan'd or rowspan'd cell contributes to the right columns.
 */
function columnWidths(rows: { cells: Node[] }[], cols: number): (number | null)[] {
	const widths: (number | null)[] = new Array(cols).fill(null);
	const covered = new Set<string>();
	rows.forEach((row, r) => {
		let c = 0;
		for (const cell of row.cells) {
			while (c < cols && covered.has(`${r},${c}`)) c++;
			const colspan = Number(cell.attrs.colspan ?? 1);
			const rowspan = Number(cell.attrs.rowspan ?? 1);
			const cw = cell.attrs.colwidth;
			if (Array.isArray(cw)) {
				for (let i = 0; i < colspan && c + i < cols; i++) {
					const v = Number(cw[i]);
					if (Number.isFinite(v) && v > 0 && widths[c + i] == null) widths[c + i] = v;
				}
			}
			for (let dr = 1; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) covered.add(`${r + dr},${c + dc}`);
			c += colspan;
		}
	});
	return widths;
}

/**
 * The `columns:` value for a table whose columns have been dragged.
 *
 * Widths become `fr` proportions rather than absolute lengths, which is what the editor actually
 * shows: its tables are laid out full width with fixed layout, so a drag redistributes share, it
 * does not set a physical size. Normalised to sum to the column count, so an untouched grid reads
 * `(1fr, 1fr, 1fr)` and the numbers stay stable instead of drifting with the window width.
 *
 * A column that was never sized stays `auto`, so a partly-dragged table keeps its content-sized
 * columns instead of being forced into a full-width layout it never asked for. Returns null when
 * NOTHING was sized, and the caller falls back to the verbatim colspec - that is what keeps an
 * untouched table byte-identical.
 */
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
