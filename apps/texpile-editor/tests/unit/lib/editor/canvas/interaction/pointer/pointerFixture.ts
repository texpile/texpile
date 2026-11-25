// the pointer machine over the real geometry of a document, for the pointer unit tests
import { EditorState, TextSelection, type Selection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { CanvasHit, CanvasPointerEvent, VisualView } from '$lib/editor/canvas';
import { PointerMachine } from '$lib/editor/canvas/interaction/pointer/pointerMachine';
import { testModel } from '../../geometry/geometryFixture';

export const { paragraph, blockquote, label } = schema.nodes;
const RULES = [{ selector: '.label-node', look: { display: 'inline-block', width: '30px', height: '16px' } }];

/** the machine over the real geometry of `doc`, doc space as client space, its view applying what it dispatches */
export function pointerOn(doc: PMNode, selection: (doc: PMNode) => Selection) {
	const { view, geometry } = testModel(doc, { rules: RULES });
	const writable = view as { -readonly [K in keyof VisualView]: VisualView[K] };
	writable.state = EditorState.create({ doc, selection: selection(doc) });
	Object.assign(view, {
		input: { lastClick: { time: 0, x: 0, y: 0, type: '' } },
		dispatch(tr: Transaction) {
			writable.state = view.state.apply(tr);
		},
		hasFocus: () => true,
		focus() {},
		canvas: { geometry, docPoint: (point: { x: number; y: number }) => point }
	});
	const machine = new PointerMachine(
		view,
		{ retarget: (event: MouseEvent) => event as unknown as CanvasPointerEvent, mousedown: () => false, endComposition() {} },
		false
	);
	let time = 0;
	function mouse(type: string, at: { x: number; y: number }, init: MouseEventInit = {}): MouseEvent {
		return new MouseEvent(type, { clientX: at.x, clientY: at.y, buttons: type === 'mouseup' ? 0 : 1, ...init });
	}
	function press(at: { x: number; y: number }, init: MouseEventInit, times: number): Selection {
		const now = Date.now;
		for (let i = 0; i < times; i++) {
			Date.now = () => time;
			machine.press(mouse('mousedown', at, init));
			machine.release(mouse('mouseup', at, init));
			time += 40;
		}
		Date.now = now;
		return view.state.selection;
	}
	return {
		view,
		geometry,
		hit: (at: { x: number; y: number }): CanvasHit => geometry.hit(at)!,
		click(at: { x: number; y: number }, init: MouseEventInit = {}): Selection {
			time += 1000;
			return press(at, init, 1);
		},
		/** two presses 40 ms apart on one spot */
		doubleClick(at: { x: number; y: number }): Selection {
			time += 1000;
			return press(at, {}, 2);
		},
		/** three presses at `at`, then a drag to `to` held down and released there */
		tripleClick(at: { x: number; y: number }, to?: { x: number; y: number }): Selection {
			time += 1000;
			press(at, {}, 2);
			time += 40;
			if (!to) return press(at, {}, 1);
			const now = Date.now;
			Date.now = () => time;
			machine.press(mouse('mousedown', at, {}));
			machine.move(mouse('mousemove', to, {}));
			machine.release(mouse('mouseup', to, {}));
			Date.now = now;
			return view.state.selection;
		}
	};
}

export const words = paragraph.create(null, [schema.text('tail '), label.create(), schema.text(' end')]);
export const labelPos = 1 + 'tail '.length;
export const caretAt = (pos: number) => (doc: PMNode) => TextSelection.create(doc, pos);
