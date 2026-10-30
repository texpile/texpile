import type { FigureStatement, NodeSide } from '../../figure/figureLanguage';
import { canvasPoint, sourcePoint, type Point } from '../../figure/geometry';
import { joinedEnds } from '../selection/joinedEnds';
import type { FigureEditorState } from '../editorState.svelte';
import { SNAP_STEP } from '../snapTargets';
import { movers } from '../selection/selectionCommands';
import { unionBox } from '../snapTargets';
import { startBoxStretch, startStretch } from '../selection/stretch';
import { anchorPoint } from '../../connectors/connectorGeometry';
import type { DrawDrag, GestureDrag, ShapePreview } from './canvasGesture.types';
import { startNodeSize } from './drags/nodeSizeDrag';
import { startRotate } from './drags/rotateDrag';
import { connectorEnds } from '../../connectors/connectorTargets';
import { subtree } from '../../objects/statementTree';

/** a side handle, `sx` or `gy`, stretches along its one axis; a corner along both */
function sideAxes(key: string) {
	return key[1] === 'x' || key[1] === 'y' ? key[1] : 'xy';
}

/** whether the group stretches only evenly: what is drawn by an angle or a radius in it, a circle, a turned part or a
 *  bend, would be drawn out of place by an uneven stretch, as a turned block off the slope it sat on */
function keepsProportions(ed: FigureEditorState, group: FigureStatement[]) {
	const inside = new Set(group.flatMap((s) => subtree(ed.tree, s.i)));
	return (ed.picture?.statements ?? group)
		.filter((s) => inside.has(s.i))
		.some(
			(s) =>
				ed.language.radii(ed.source, s).some((r) => r.axis === 'r') ||
				Math.abs(ed.language.readRotation(ed.source, s) ?? 0) > 1e-9 ||
				/^(bend|loop)/.test(ed.language.readConnector(ed.source, s)?.route ?? '')
		);
}

/** the drag a press on one of the selection's handles starts: `key` is its `data-handle` */
export function handleDrag(ed: FigureEditorState, key: string, owner: FigureStatement, at: Point): GestureDrag | null {
	const m = ed.render.transformOf(owner.i);
	if (key[0] === 'g') {
		const group = movers(ed);
		const box = unionBox(ed.snapBoxes.filter((b) => group.some((s) => s.i === b.stmt)));
		if (!box) return null;
		const placement = ed.placement;
		const [u1, v1] = sourcePoint(box.x1, box.y1, placement);
		const [u2, v2] = sourcePoint(box.x2, box.y2, placement);
		const start = sourcePoint(...at, placement);
		const stretch = startBoxStretch(
			[Math.min(u1, u2), Math.max(u1, u2), Math.min(v1, v2), Math.max(v1, v2)],
			start,
			keepsProportions(ed, group)
		);
		return { kind: 'stretchGroup', m: placement, base: ed.source, group, start, ...stretch, axes: sideAxes(key) };
	}
	if (key === 'rot') return startRotate(ed, at);
	if (key[0] === 'n') return startNodeSize(ed, owner, at, sideAxes(key));
	if (key === 'k') {
		const c = ed.selectedConnector;
		const ends = c && connectorEnds(ed, ed.source, owner, c.connector);
		return ends ? { kind: 'bend', base: ed.source, st: owner, ends } : null;
	}
	if (key[0] === 's') {
		const start = sourcePoint(...at, m);
		const stretch = startStretch(ed.language.pathPoints(ed.source, owner), ed.language.radii(ed.source, owner), start);
		return { kind: 'stretch', m, base: ed.source, st: owner, start, ...stretch, axes: sideAxes(key) };
	}
	if (key[0] === 'e') return { kind: 'end', m, base: ed.source, i: owner.i, k: key[1] === '1' ? 1 : 0 };
	if (key[0] === 'c') {
		// a named point the path is drawn through: its `\coordinate` moves
		const set = ed.picture?.statements.find((s) => s.i === Number(key.slice(1)));
		const points = set ? ed.language.pathPoints(ed.source, set) : [];
		const k = points.findIndex((p) => !p.relative);
		return set && k >= 0 ? { kind: 'point', start: at, m: ed.render.transformOf(set.i), base: ed.source, points, k, joined: [] } : null;
	}
	if (key[0] === 'r') {
		const radius = ed.language.radii(ed.source, owner)[Number(key.slice(1))];
		return radius ? { kind: 'radius', m, base: ed.source, radius } : null;
	}
	const points = ed.language.pathPoints(ed.source, owner);
	const k = Number(key.slice(1));
	if (!points[k]) return null;
	const joined = joinedEnds(ed, [owner.i], [canvasPoint(points[k].x, points[k].y, m)]);
	return { kind: 'point', start: at, m, base: ed.source, points, k, joined };
}

/** an arrow out of a node, from the side handle pressed and shown leaving by it; written from the node's border */
export function connectorPress(ed: FigureEditorState, handle: Element, at: Point): { drag: DrawDrag; preview: ShapePreview } {
	const from = Number(handle.getAttribute('data-connect-from'));
	const pin = ed.render.pins.find((p) => p.i === from && p.anchor === handle.getAttribute('data-connect-pin'));
	if (pin) {
		// a pin's wire is a circuit's, drawn as one
		const start = sourcePoint(...pin.at, ed.placement);
		return {
			drag: { kind: 'draw', start },
			preview: { tool: 'component', part: 'short', points: [start, start], circle: false, refs: [from, null], anchors: [pin.anchor, null] }
		};
	}
	const box = ed.snapBoxes.find((b) => b.stmt === from);
	const side = handle.getAttribute('data-connect-side') as NodeSide;
	const start = box ? sourcePoint(...anchorPoint(box, side), ed.placement) : ed.toSource(...at, SNAP_STEP.fine);
	return {
		drag: { kind: 'draw', start, side },
		preview: { tool: 'arrow', points: [start, start], circle: false, refs: [from, null], anchors: [null, null] }
	};
}
