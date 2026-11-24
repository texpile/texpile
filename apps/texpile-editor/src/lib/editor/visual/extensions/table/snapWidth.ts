// the detent a Typst column drag lands on
import { FR_STEP } from '$lib/languages/typst/visual/serialize/tracks';

export type SnapContext = { tableWidth: number; columns: number };

/**
 * One quarter of an `fr`, which is the same grid the width is written to the file on - so what the
 * drag feels and what the source says are the same set of positions.
 *
 * With the mean column being 1fr, a step is (table width / columns) / 4: a three-column table
 * 900px wide notches every 75px. Proportional rather than a fixed pixel count, so the feel does not
 * change with the pane. Never returns less than one step, so a column cannot be dragged away.
 */
export function snapWidthToFr(rawWidth: number, { tableWidth, columns }: SnapContext): number {
	const step = (tableWidth * FR_STEP) / Math.max(1, columns);
	if (!(step > 0)) return rawWidth;
	return Math.max(step, Math.round(rawWidth / step) * step);
}
