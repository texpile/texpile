// Ctrl+Up and Ctrl+Down: Up goes to the paragraph's start, Down to its end (Windows: the next paragraph's start), and
// from that edge to the same edge of the next paragraph
import type { Platform } from '$lib/editor/keys/platformKeys';
import type { CaretPlace } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { contentEdge, facingEdgeBeyond, textblockAround } from './caretTextblocks';

export type VerticalTarget = { place: CaretPlace; x: number };

function paragraphEdge(view: VisualView, platform: Platform, dir: -1 | 1, extend: boolean, from: number): number | null {
	const here = textblockAround(view.state.doc.resolve(from));
	if (!here) return null;
	const side = dir > 0 && platform !== 'windows' ? 1 : -1;
	const edge = contentEdge(here, side);
	if (dir < 0 ? from > edge : side > 0 && from < edge) return edge;
	const beyond = facingEdgeBeyond(view, here, dir, extend);
	if (beyond === null) return contentEdge(here, dir);
	const next = textblockAround(view.state.doc.resolve(beyond));
	return next ? contentEdge(next, side) : beyond;
}

export function paragraphTarget(
	view: VisualView,
	platform: Platform,
	dir: -1 | 1,
	extend: boolean,
	head: CaretPlace = view.canvas.head()
): VerticalTarget | null {
	const pos = paragraphEdge(view, platform, dir, extend, head.pos);
	if (pos === null) return null;
	const place: CaretPlace = { pos, affinity: dir > 0 && platform !== 'windows' ? -1 : 1 };
	return { place, x: view.canvas.geometry.caretRect(place)?.x ?? 0 };
}
