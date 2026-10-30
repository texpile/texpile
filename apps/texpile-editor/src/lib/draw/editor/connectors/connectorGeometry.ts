import type { Point, Box } from '../figure/geometry';

/** the sides a connector can start or end at, as TikZ names its anchors */
export const SIDES = ['north', 'east', 'south', 'west'] as const;
/** a box's corners, which a round node has none of */
export const CORNERS = ['north east', 'south east', 'south west', 'north west'] as const;

export function anchorPoint(b: Box, anchor: string | null): Point {
	const [cx, cy] = [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
	const x = anchor?.includes('east') ? b.x2 : anchor?.includes('west') ? b.x1 : cx;
	const y = anchor?.includes('north') ? b.y2 : anchor?.includes('south') ? b.y1 : cy;
	return [x, y];
}

/** the anchor on the outline a point is on, as draw.io's fixed points are: a corner of a box, or a side's middle; the
 *  middle of a node is the node itself, met at its border */
export function exactAnchor(b: Box, at: Point, reach: number, round: boolean): string | null {
	const anchors = [...(round ? [] : CORNERS), ...SIDES];
	// on a small node, no nearer its middle than a third of its size
	const within = Math.min(reach, Math.min(b.x2 - b.x1, b.y2 - b.y1) / 3);
	const near = anchors.find((a) => {
		const [x, y] = anchorPoint(b, a);
		return Math.hypot(x - at[0], y - at[1]) <= within;
	});
	return near ?? null;
}

/** near a side, that side; inside, none, so TikZ meets the border on the way to the other end. Near means within
 *  `reach`, or a third of a small node, of the edge */
export function pickAnchor(b: Box, [x, y]: Point, reach: number): string | null {
	const edge: Record<(typeof SIDES)[number], number> = {
		north: Math.abs(b.y2 - y),
		east: Math.abs(b.x2 - x),
		south: Math.abs(y - b.y1),
		west: Math.abs(x - b.x1)
	};
	const best = SIDES.reduce((a, side) => (edge[side] < edge[a] ? side : a));
	return edge[best] <= Math.min(reach, Math.min(b.x2 - b.x1, b.y2 - b.y1) / 3) ? best : null;
}

/** where the line from the box's middle toward a point leaves the box */
export function borderToward(b: Box, [x, y]: Point): Point {
	const [cx, cy] = anchorPoint(b, null);
	const [dx, dy] = [x - cx, y - cy];
	const [hw, hh] = [(b.x2 - b.x1) / 2, (b.y2 - b.y1) / 2];
	const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
	return Number.isFinite(t) && t < 1 ? [cx + dx * t, cy + dy * t] : [cx, cy];
}
