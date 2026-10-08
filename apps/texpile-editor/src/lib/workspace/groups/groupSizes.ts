// How big each editor slot is drawn, as in Zed: never smaller than an editor can be used at; when the slots
// cannot all fit, the editor area scrolls instead of squeezing them
export const MIN_COLUMN_PX = 360;
export const MIN_ROW_PX = 240;

/** whole pixels per track: its share of `room`, each at least `least` */
export function trackSizes(shares: number[], room: number, least: number): number[] {
	if (shares.length < 2) return shares.map(() => Math.max(0, Math.round(room)));
	const pinned = new Set<number>();
	for (;;) {
		const free = room - pinned.size * least;
		const rest = shares.reduce((sum, s, i) => (pinned.has(i) ? sum : sum + s), 0);
		const under = shares.findIndex((s, i) => !pinned.has(i) && (s / rest) * free < least);
		if (under < 0) break;
		pinned.add(under);
	}
	const free = room - pinned.size * least;
	const rest = shares.reduce((sum, s, i) => (pinned.has(i) ? sum : sum + s), 0);
	const sizes = shares.map((s, i) => (pinned.has(i) ? least : Math.floor((s / rest) * free)));
	// what flooring left over goes to the last track that grows
	const last = sizes.findLastIndex((_, i) => !pinned.has(i));
	if (last >= 0) sizes[last] += room - sizes.reduce((sum, w) => sum + w, 0);
	return sizes;
}

/** the divider after track `index` moved by `delta` pixels: the new sizes */
export function movedDivider(sizes: number[], index: number, delta: number, least: number): number[] {
	const a = sizes[index];
	const b = sizes[index + 1];
	if (a === undefined || b === undefined || a + b < 2 * least) return sizes;
	const next = Math.max(least, Math.min(a + b - least, a + Math.round(delta)));
	return sizes.map((w, i) => (i === index ? next : i === index + 1 ? a + b - next : w));
}

/** the column widths and row heights of a layout in `room`, whole pixels, a pixel left for each divider */
export function layoutTracks(
	tracks: { rows: number; columns: number },
	split: { column: number; row: number },
	room: { width: number; height: number }
): { columns: number[]; rows: number[] } {
	function sizes(count: number, part: number, space: number, least: number): number[] {
		return count < 2 ? [Math.max(0, Math.round(space))] : trackSizes([part, 1 - part], space - 1, least);
	}
	return {
		columns: sizes(tracks.columns, split.column, room.width, MIN_COLUMN_PX),
		rows: sizes(tracks.rows, split.row, room.height, MIN_ROW_PX)
	};
}

/** a grid axis's tracks for CSS, dividers between: every track but the last at its pixels, the last at least `least`
 *  and taking the rest. Only a minimum, never the last frame's pixels: the area shrinking a step would overflow for
 *  the frame before the sizes catch up, show scrollbars, lose their height and move every divider, on every step */
export function trackTemplate(px: number[], least: number): string {
	return px.map((n, i) => (i === px.length - 1 ? `minmax(${px.length > 1 ? least : 0}px, 1fr)` : `${n}px`)).join(' 1px ');
}

/** the least the axis can be drawn in before the area scrolls */
export function trackSpan(px: number[], least: number): number {
	return px.length > 1 ? px.slice(0, -1).reduce((sum, n) => sum + n + 1, 0) + least : 0;
}

/** how far to scroll so a slot at `start` (from the view's edge), `size` long, is in a view `room` long */
export function revealShift(start: number, size: number, room: number): number {
	if (start < 0 || size > room) return start;
	return Math.max(0, start + size - room);
}
