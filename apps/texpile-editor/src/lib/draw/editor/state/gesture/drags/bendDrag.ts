import type { Point } from '../../../figure/geometry';
import type { FigureEditorState } from '../../editorState.svelte';
import type { BendDrag } from '../canvasGesture.types';

// TikZ's bent `to` has controls 0.3915 of the length out; a curve's middle is 0.75 of the way to them
const MIDDLE_PER_SINE = 0.75 * 0.3915;
const STEP_DEG = 5;

function normalOf([a, b]: [Point, Point]) {
	const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
	return { length, n: [-(b[1] - a[1]) / length, (b[0] - a[0]) / length] as Point, middle: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point };
}

export function bendHandleAt(ends: [Point, Point], degrees: number): Point {
	const { length, n, middle } = normalOf(ends);
	const off = MIDDLE_PER_SINE * length * Math.sin((degrees * Math.PI) / 180);
	return [middle[0] + n[0] * off, middle[1] + n[1] * off];
}

export function bendSource(ed: FigureEditorState, drag: BendDrag, at: Point) {
	const { length, n, middle } = normalOf(drag.ends);
	const off = (at[0] - middle[0]) * n[0] + (at[1] - middle[1]) * n[1];
	const sine = Math.max(-1, Math.min(1, off / (MIDDLE_PER_SINE * length)));
	const degrees = Math.round((Math.asin(sine) * 180) / Math.PI / STEP_DEG) * STEP_DEG;
	if (!degrees) return ed.language.writeConnector(drag.base, drag.st, { route: 'straight' });
	return ed.language.writeConnector(drag.base, drag.st, { route: degrees > 0 ? 'bend left' : 'bend right', bend: Math.abs(degrees) });
}
