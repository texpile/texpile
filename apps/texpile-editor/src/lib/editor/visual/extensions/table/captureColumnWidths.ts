// Column widths for Typst tables, measured on the canvas layout.
//
// Everything here exists because `fr` is a SHARE, and a share can only be turned into pixels once
// something has measured the table. Two jobs, both needing that measurement:
//
//   on open   a table whose source says `(2fr, 1fr, 1fr)` should LOOK like that. The converter
//             cannot do it - it has no DOM, and a nominal pixel count would pin the table to a
//             width unrelated to the pane.
//   on drag   prosemirror-tables writes colwidth onto the dragged column only. The serializer needs
//             every column to compute proportions, so the rest are measured and filled in, and the
//             whole set is snapped to quarter-fr steps so the column lands on a round layout.
//
// Both paths end at `distribute`, which spends exactly the table's own width. That matters more
// than it sounds: updateColumnsOnResize pins a FULLY sized table to the sum of its columns
// (table.style.width), so being a few pixels over the container is the difference between a table
// that fits and one with a scrollbar under it.
import { Plugin, PluginKey } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import type { VisualView } from '$lib/editor/canvas';
import {
	columnWidthsOf,
	distribute,
	followsTracks,
	parseTracks,
	toFrShares,
	type Track
} from '$lib/languages/typst/visual/serialize/tracks';

const key = new PluginKey('captureColumnWidths');

/** the grid width of a table: its widest row, spans counted. */
function gridWidth(table: Node): number {
	let cols = 0;
	table.forEach((row) => {
		let w = 0;
		row.forEach((cell) => (w += Number(cell.attrs.colspan ?? 1)));
		cols = Math.max(cols, w);
	});
	return cols;
}

/** per-column drawn widths from the first row, and the width of the table's block, which the columns may take */
function measure(view: EditorView, pos: number, table: Node, cols: number): { widths: number[]; total: number } | null {
	const { geometry } = (view as unknown as VisualView).canvas;
	const block = geometry.nodeRect(pos);
	const row = table.firstChild;
	if (!block || block.estimated || !row) return null;
	const widths: number[] = [];
	let missing = false;
	row.forEach((cell, offset) => {
		const span = Number(cell.attrs.colspan ?? 1);
		const width = geometry.nodeRect(pos + 2 + offset)?.rect.width ?? 0;
		if (!(width > 0)) missing = true;
		for (let i = 0; i < span; i++) widths.push(width / span);
	});
	if (missing || widths.length !== cols) return null;
	const total = Math.floor(block.rect.width);
	return total > 0 ? { widths, total } : null;
}

/** how far the current columns are from filling the space available to them. */
function overflowBy(widths: number[], total: number): number {
	return Math.abs(widths.reduce((a, b) => a + b, 0) - total);
}

function widthOf(cell: Node): number | null {
	const cw = cell.attrs.colwidth;
	if (!Array.isArray(cw)) return null;
	const v = Number(cw[0]);
	return Number.isFinite(v) && v > 0 ? v : null;
}

function sizedCounts(table: Node): { sized: number; bare: number } {
	let sized = 0;
	let bare = 0;
	table.forEach((row) => row.forEach((cell) => (widthOf(cell) == null ? bare++ : sized++)));
	return { sized, bare };
}

/** write one width per column onto the cells that start in it. */
function applyWidths(view: EditorView, table: Node, pos: number, cols: number, widths: (number | null)[]): boolean {
	const tr = view.state.tr;
	const covered = new Set<string>();
	let changed = false;
	table.forEach((row, rowOffset, r) => {
		let c = 0;
		row.forEach((cell, cellOffset) => {
			while (c < cols && covered.has(`${r},${c}`)) c++;
			const span = Number(cell.attrs.colspan ?? 1);
			const rowspan = Number(cell.attrs.rowspan ?? 1);
			const slice = widths.slice(c, c + span).map((w) => (w == null ? 0 : Math.round(w)));
			const cw = cell.attrs.colwidth;
			if (slice.length === span && JSON.stringify(cw) !== JSON.stringify(slice)) {
				tr.setNodeMarkup(pos + 1 + rowOffset + 1 + cellOffset, undefined, { ...cell.attrs, colwidth: slice });
				changed = true;
			}
			for (let dr = 1; dr < rowspan; dr++) for (let dc = 0; dc < span; dc++) covered.add(`${r + dr},${c + dc}`);
			c += span;
		});
	});
	// widths change no position: a gap cursor stays, though prosemirror-gapcursor's own check refuses one beside a display
	const { selection } = view.state;
	if (changed && selection instanceof GapCursor) tr.setSelection(new GapCursor(tr.doc.resolve(selection.head)));
	if (changed) view.dispatch(tr.setMeta('addToHistory', false));
	return changed;
}

/**
 * Bring every table in the doc up to date. Returns false when some table could not be measured
 * yet - the caller retries rather than recording the doc as done, because a table in a pane that
 * has not been laid out reports zero width and would otherwise be skipped forever.
 */
function sync(view: EditorView): boolean {
	let complete = true;
	view.state.doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true;
		const cols = gridWidth(node);
		if (cols === 0) return false;
		const { sized, bare } = sizedCounts(node);

		// the widths the file's own tracks give: nothing was dragged, and the file keeps the sizes it has
		const tracks = parseTracks(node.attrs.colspec, cols);
		const asWritten = !!tracks && (sized === 0 || followsTracks(columnWidthsOf(node, cols), tracks));
		if (sized === 0 && !(asWritten && tracks.some((t) => t.kind !== 'auto'))) return false;

		const m = measure(view, pos, node, cols);
		if (!m) {
			complete = false; // laid out later; try again
			return false;
		}

		if (asWritten) {
			// the fr columns share what the auto columns leave of the pane, which shows once the fr columns have a width
			const taken = sized === 0 ? 0 : tracks.reduce((sum, track, i) => sum + (track.kind === 'auto' ? m.widths[i] : 0), 0);
			applyWidths(view, node, pos, cols, distribute(tracks, m.total - taken));
			return false;
		}

		// mid-drag: some columns sized, some not; or dragged columns that no longer add up to the space
		// available, after the pane was resized or a column was added
		if (!(sized > 0 && bare > 0) && overflowBy(m.widths, m.total) <= 2) return false;
		const shares = toFrShares(m.widths);
		if (!shares) return false;
		const snapped: Track[] = shares.map((s) => (s == null ? { kind: 'auto' } : { kind: 'fr', value: s }));
		applyWidths(view, node, pos, cols, distribute(snapped, m.total));
		return false;
	});
	return complete;
}

/** a table in a hidden pane never gets a width; stop retrying rather than spin at 60fps */
const MAX_RETRY_FRAMES = 30;

export const captureColumnWidths = new Plugin({
	key,
	view(view: EditorView) {
		let lastDoc: Node | null = null;
		let frame = 0;
		let attempts = 0;

		function run() {
			frame = 0;
			if (sync(view) || ++attempts >= MAX_RETRY_FRAMES) {
				lastDoc = view.state.doc;
				attempts = 0;
				return;
			}
			schedule(); // measured nothing useful yet - the table is not laid out
		}

		// next frame, not now: on a fresh mount the table has no box to measure yet
		function schedule() {
			if (!frame) frame = requestAnimationFrame(run);
		}

		// ProseMirror builds plugin views WITHOUT calling update (updatePluginViews skips it when
		// there is no prevState), so an opened document would otherwise keep its source proportions
		// only from the first edit onwards
		schedule();

		return {
			update(v: EditorView) {
				if (v.state.doc === lastDoc) return;
				attempts = 0;
				schedule();
			},
			destroy() {
				if (frame) cancelAnimationFrame(frame);
			}
		};
	}
});
