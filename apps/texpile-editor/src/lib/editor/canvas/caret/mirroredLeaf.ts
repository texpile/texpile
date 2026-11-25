import type { VisualView } from '../contracts/viewTypes';

/** an inline leaf among right-to-left text stands mirrored: its start is its right edge */
export function leafMirrored(view: VisualView, pos: number): boolean {
	const right = view.canvas.geometry.visualStep({ pos, affinity: 1 }, 1, true);
	return right?.kind === 'place' && right.place.pos === pos;
}
