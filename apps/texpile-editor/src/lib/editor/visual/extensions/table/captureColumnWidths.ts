// Column widths for Typst tables: the DOM half of the resize.
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
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { parseTracks, distribute, toFrShares, type Track } from '$lib/languages/typst/visual/serialize/tracks';

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

/**
 * The width the table is actually allowed to occupy: the nearest ancestor that scrolls or clips.
 *
 * Not the TableView wrapper. App CSS gives `.tableWrapper` `overflow: visible !important` (it has
 * to, or the boundary swallows drag selections), so it stretches to fit whatever the table is -
 * measuring it just reads the oversized table back and any overflow becomes permanent. The element
 * that constrains is `.table-wrapper-content` for a captioned table, and the editor's own content
 * box for a bare one; both are found by looking for the first ancestor that is not `visible`.
 */
function availableWidth(dom: HTMLElement): number {
	for (let el = dom.parentElement; el; el = el.parentElement) {
		if (getComputedStyle(el).overflowX !== 'visible') return el.clientWidth;
		if (el.classList.contains('ProseMirror')) return el.clientWidth;
	}
	return dom.clientWidth;
}

/** per-column rendered widths, from the first row that spans nothing. */
function measure(dom: HTMLElement, cols: number): { widths: number[]; total: number } | null {
	const table = dom.querySelector('table');
	const row = dom.querySelector('tr');
	if (!table || !row) return null;
	const widths: number[] = [];
	for (const cell of Array.from(row.children) as HTMLElement[]) {
		const span = Number(cell.getAttribute('colspan') ?? 1);
		const w = cell.getBoundingClientRect().width;
		if (!(w > 0)) return null;
		for (let i = 0; i < span; i++) widths.push(w / span);
	}
	if (widths.length !== cols) return null;
	// The constraining ancestor, not the table and not its immediate wrapper - either of those is
	// as wide as the table already is, so spending that width makes an overflow permanent.
	//
	// The table's own chrome is measured rather than assumed: with border-collapse the outer border
	// can sit outside the column boxes, and a single stray pixel is a visible scrollbar.
	const cellSum = widths.reduce((a, b) => a + b, 0);
	const chrome = Math.max(0, Math.ceil(table.getBoundingClientRect().width - cellSum));
	const total = Math.floor(availableWidth(dom)) - chrome;
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

		// nothing to do: no source tracks to honour and no drag to finish
		const tracks = sized === 0 ? parseTracks(node.attrs.colspec, cols) : null;
		const wantsOpen = sized === 0 && !!tracks && !tracks.every((t) => t.kind === 'auto');
		const partlySized = sized > 0 && bare > 0;
		if (!wantsOpen && sized === 0) return false;

		const dom = view.nodeDOM(pos);
		if (!(dom instanceof HTMLElement)) return false;
		const m = measure(dom, cols);
		if (!m) {
			complete = false; // laid out later; try again
			return false;
		}

		// A fully sized table still needs correcting when its columns no longer add up to the space
		// available - the pane was resized, or a column was added. Without this a table that once
		// overflowed keeps its scrollbar forever, since nothing else revisits it. distribute() spends
		// the total exactly, so the next pass finds a difference of zero and stops.
		const wantsDrag = partlySized || overflowBy(m.widths, m.total) > 2;
		if (!wantsOpen && !wantsDrag) return false;

		if (wantsDrag) {
			// mid-drag: some columns sized, some not. Snap the whole set and spend the table's width.
			const shares = toFrShares(m.widths);
			if (!shares) return false;
			const snapped: Track[] = shares.map((s) => (s == null ? { kind: 'auto' } : { kind: 'fr', value: s }));
			applyWidths(view, node, pos, cols, distribute(snapped, m.total));
		} else {
			applyWidths(view, node, pos, cols, distribute(tracks!, m.total));
		}
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
