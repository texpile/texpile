import type { Point } from '../../../figure/geometry';
import type { ConnectorRoute, Endpoint } from '../../../figure/figureLanguage';
import type { FigureEditorState } from '../../editorState.svelte';
import type { ShapePreview } from '../canvasGesture.types';
import { MIN_SIZE } from '../gestureThresholds';
import { NODE_TOOL_SHAPES } from '../../../tools/tools';
import { familyOf, type ShapeFamily } from '../../drawModes/drawModes';
import { boxCorners, drawnGeometry } from '../../drawModes/drawnGeometry';

/** the shape a finished draw writes */
export function addDrawnShape(ed: FigureEditorState, p: ShapePreview) {
	const [a, b] = [p.points[0], p.points.at(-1)!];
	function end(k: 0 | 1, at: Point): Endpoint {
		return p.refs[k] === null ? at : { ref: p.refs[k]!, at, anchor: p.anchors[k] };
	}
	if ((p.tool === 'line' || p.tool === 'arrow') && p.refs[0] !== null && p.refs[0] === p.refs[1]) {
		const side = { north: 'above', south: 'below', east: 'right', west: 'left' }[p.anchors[1] ?? 'north'] ?? 'above';
		const at = { ref: p.refs[0], at: a };
		ed.addShape({ tool: p.tool, from: at, to: at, route: `loop ${side}` as ConnectorRoute });
		return;
	}
	const family = familyOf(p.tool);
	if (family) {
		addModeShape(ed, p, family);
		return;
	}
	const clicked = p.points.every((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) < MIN_SIZE);
	// a line drawn click by click back to where it started is closed
	const closed = p.points.length > 3 && Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SIZE && p.refs.every((r) => r === null);
	if (p.tool === 'component') {
		// a click places one of a common length, across; a click on a node or a pin places nothing
		if (clicked && p.refs[0] !== null) return;
		ed.addShape({ tool: 'component', part: p.part ?? ed.nextPart, from: end(0, a), to: clicked ? [a[0] + 2, a[1]] : end(1, b) });
		return;
	}
	if (clicked) return;
	if (p.tool === 'axes') {
		if (Math.abs(b[0] - a[0]) >= MIN_SIZE && Math.abs(b[1] - a[1]) >= MIN_SIZE) ed.addShape({ tool: 'axes', from: a, to: b });
		return;
	}
	if (p.tool === 'line' && closed) ed.addShape({ tool: 'polygon', points: p.points.slice(0, -1) });
	else if (p.tool === 'line' || p.tool === 'arrow' || p.tool === 'curve') {
		ed.addShape({ tool: p.tool, from: end(0, a), to: end(1, b), via: p.points.slice(1, -1) });
	} else if (p.tool === 'pen') ed.addShape({ tool: 'pen', points: p.points.slice(0, -1) });
}

/** a rectangle or an ellipse as its mode draws it from the points placed */
function addModeShape(ed: FigureEditorState, p: ShapePreview, family: ShapeFamily) {
	const g = drawnGeometry(family, p.mode ?? 'corners', p.points, { square: p.circle });
	const shape = NODE_TOOL_SHAPES[p.tool];
	if (!g || g.kind === 'side') return;
	const [w, h] = g.kind === 'box' ? [g.w, g.h] : [2 * g.rx, 2 * g.ry];
	const [cu, cv] = g.center;
	function box(sw: number, sh: number): [Point, Point] {
		return [
			[cu - sw / 2, cv - sh / 2],
			[cu + sw / 2, cv + sh / 2]
		];
	}
	if (shape) {
		// two clicks on one spot place one of a common size
		const click = w < MIN_SIZE || h < MIN_SIZE;
		const [from, to] = click ? box(2, 1) : box(w, h);
		const outline = g.kind === 'ellipse' && g.circle ? 'circle' : shape;
		const angle = g.kind === 'box' && !click ? g.angle : 0;
		ed.addShape({ tool: 'box', from, to, shape: outline, ...(angle ? { angle } : {}) });
		return;
	}
	if (w < MIN_SIZE || (h < MIN_SIZE && !(g.kind === 'ellipse' && g.circle))) return;
	if (g.kind === 'ellipse') {
		const [from, to] = box(w, h);
		ed.addShape({ tool: 'ellipse', from, to, circle: g.circle });
	} else if (g.angle) ed.addShape({ tool: 'polygon', points: boxCorners(g) });
	else {
		const [from, to] = box(w, h);
		ed.addShape({ tool: 'rect', from, to });
	}
}
