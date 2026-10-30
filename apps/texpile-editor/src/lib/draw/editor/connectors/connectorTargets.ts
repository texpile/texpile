import type { CircuitPin, Connector, FigureStatement } from '../figure/figureLanguage';
import { canvasPoint, type Point } from '../figure/geometry';
import type { FigureEditorState } from '../state/editorState.svelte';
import type { StatementBox } from '../state/snapTargets.types';
import { anchorPoint, borderToward, exactAnchor, pickAnchor } from './connectorGeometry';

/** a node an end would attach to: at an anchor, or its border when the anchor is null; `at` is in bp. A circuit
 *  node is met at one of its `pins` */
export type NodeAttachTarget = { ref: number; anchor: string | null; box: StatementBox; at: Point; pins: CircuitPin[]; round: boolean };

/** each node's drawn box, by statement; a diagram's cells are its nodes */
function nodeBoxes(ed: FigureEditorState) {
	const nodes = new Set(ed.picture?.statements.filter((s) => s.kind === 'node' || s.kind === 'cell').map((s) => s.i));
	const { hiddenAll, lockedAll } = ed.flags;
	return ed.snapBoxes.filter((b) => nodes.has(b.stmt) && !hiddenAll.has(b.stmt) && !lockedAll.has(b.stmt));
}

/** the smallest node box around a point, `pad` bp past its edges counting */
export function nodeAt(ed: FigureEditorState, [x, y]: Point, exclude: number[] = [], pad = 0) {
	const inside = nodeBoxes(ed).filter(
		(b) => !exclude.includes(b.stmt) && b.x1 - pad <= x && x <= b.x2 + pad && b.y1 - pad <= y && y <= b.y2 + pad
	);
	return inside.sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0] ?? null;
}

const BIND_REACH_PX = 15;
const SIDE_REACH_PX = 8;

export function attachAt(ed: FigureEditorState, at: Point, exclude: number[] = []): NodeAttachTarget | null {
	// as far out as Excalidraw binds an arrow; a side is picked only close to it
	const box = nodeAt(ed, at, exclude, BIND_REACH_PX / ed.viewport.scale);
	if (!box) return null;
	const pins = ed.render.pins.filter((p) => p.i === box.stmt);
	if (pins.length) {
		const pin = pins.reduce((a, b) =>
			Math.hypot(b.at[0] - at[0], b.at[1] - at[1]) < Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) ? b : a
		);
		return { ref: box.stmt, anchor: pin.anchor, box, at: pin.at, pins, round: false };
	}
	const st = ed.tree.byId.get(box.stmt);
	const shape = st && ed.language.readNodeBox(ed.source, st)?.shape;
	const round = shape === 'circle' || shape === 'ellipse';
	// on one of its snap points, exactly there; else near a side, that side; tikz-cd meets a cell at its border
	const reach = SIDE_REACH_PX / ed.viewport.scale;
	const anchor = ed.picture?.layout ? null : (exactAnchor(box, at, reach, round) ?? pickAnchor(box, at, reach));
	return { ref: box.stmt, anchor, box, at: anchorPoint(box, anchor), pins, round };
}

/** where a connector's ends are drawn, in bp: a point where it is written, a node's anchor, or where it leaves the node */
export function connectorEnds(ed: FigureEditorState, text: string, st: FigureStatement, c: Connector): [Point, Point] | null {
	const m = ed.render.transformOf(st.i);
	const points = ed.language.pathPoints(text, st).filter((p) => !p.relative);
	const boxes = nodeBoxes(ed);
	const statements = (text === ed.source ? ed.picture : ed.language.readPicture(text, ed.shownIndex))?.statements ?? [];
	function named(name: string | null) {
		const node = name ? statements.find((s) => s.kind === 'node' && ed.language.nameOf(text, s) === name) : null;
		return node ? (boxes.find((b) => b.stmt === node.i) ?? null) : null;
	}
	const boxOf = c.ends.map((e) => named(e.node));
	const plain = [points[0], points.at(-1)];
	// first each end on its own, then a border end toward the other
	const own = c.ends.map((e, k): Point | null => {
		if (!e.node) return plain[k] ? canvasPoint(plain[k]!.x, plain[k]!.y, m) : null;
		const box = boxOf[k];
		const pin = box && ed.render.pins.find((p) => p.i === box.stmt && p.anchor === e.anchor);
		return pin ? pin.at : box ? anchorPoint(box, e.anchor) : null;
	});
	if (!own[0] || !own[1]) return null;
	const [a, b] = own as [Point, Point];
	// a route with a corner leaves and meets each node toward the corner
	const corner: Point | null = c.route === 'hv' ? [b[0], a[1]] : c.route === 'vh' ? [a[0], b[1]] : null;
	const ends = c.ends.map((e, k): Point => {
		const box = boxOf[k];
		return box && !e.anchor ? borderToward(box, corner ?? own[1 - k]!) : own[k]!;
	});
	return [ends[0], ends[1]];
}
