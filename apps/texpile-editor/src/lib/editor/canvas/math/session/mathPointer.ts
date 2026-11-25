// a press inside a formula (13.8): the formula selected, its session started or kept, MathLive's pointer logic at the point
import { NodeSelection } from 'prosemirror-state';
import type { MathPointerCapture } from 'mathlive';
import type { CanvasPointerEvent, FaceEventContext } from '../../contracts/faceTypes';
import type { VisualView } from '../../contracts/viewTypes';
import type { CanvasMathSession } from './mathSession';
import { formulaFieldRect } from './mathGeometryHost';
import { macroCallAt } from './mathMacroKeys';
import { openMathMacroPanel } from './mathMacroPanel';

const pressing = new WeakMap<VisualView, FaceEventContext>();

function sessionOf(view: VisualView): CanvasMathSession | null {
	const nested = view.canvas.nested();
	return nested?.kind === 'math' ? (nested as CanvasMathSession) : null;
}

function insideField(view: VisualView, pos: number, event: CanvasPointerEvent): boolean {
	const node = view.state.doc.nodeAt(pos);
	const box = node && formulaFieldRect(view, pos, node.isBlock);
	return !!box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
}

function plainPress(event: CanvasPointerEvent): boolean {
	return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/** MathLive's pointer tracker on the canvas: the press's face capture forwards the moves until the release */
export function mathPointerCapture(view: VisualView): MathPointerCapture {
	return {
		start(onMove, onEnd) {
			pressing.get(view)?.capture({
				move: (event) => onMove(event),
				release: () => onEnd(),
				cursor: 'text'
			});
		},
		stop() {}
	};
}

/** the left button on a formula: MathLive places its caret at the point, by the midline rule, or extends with Shift */
export function pressFormula(event: CanvasPointerEvent, ctx: FaceEventContext): boolean {
	if (event.button !== 0) return false;
	const { view } = ctx;
	const pos = ctx.pos();
	// beside a display the press is the text's: the caret goes after it
	if (!insideField(view, pos, event)) return false;
	let session = sessionOf(view);
	if (!view.hasFocus()) view.focus();
	if (session?.pos !== pos) {
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta('pointer', true));
		session = sessionOf(view);
	}
	if (session?.pos !== pos) return true;
	const call = plainPress(event) && view.editable ? macroCallAt(session, event.clientX, event.clientY) : null;
	if (call !== null && openMathMacroPanel(session, call)) return true;
	pressing.set(view, ctx);
	try {
		session.field.onPointerDown(event as unknown as MouseEvent);
	} finally {
		pressing.delete(view);
	}
	return true;
}
