// touch on the canvas (11.8, D37): a long press selects the word under the finger and a drag of a handle extends it
import { TextSelection } from 'prosemirror-state';
import type { VisualView } from '../../contracts/viewTypes';

const LONG_PRESS_MS = 500;
const SLOP_PX = 10;

export type TouchParts = {
	readonly view: VisualView;
	/** the handles are drawn while a touch selection exists */
	showHandles(on: boolean): void;
};

/** pointer events of type touch on view.dom; vertical pans stay the browser's (touch-action: pan-y) */
export class TouchGestures {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private start: { id: number; x: number; y: number } | null = null;
	private longPressed = false;
	private readonly onDown = (event: PointerEvent): void => this.down(event);
	private readonly onMove = (event: PointerEvent): void => this.move(event);
	private readonly onEnd = (event: PointerEvent): void => this.end(event);
	private readonly onMenu = (event: Event): void => {
		if (this.longPressed) event.preventDefault();
	};

	constructor(private readonly parts: TouchParts) {
		const { dom } = parts.view;
		dom.style.touchAction = 'pan-y';
		dom.addEventListener('pointerdown', this.onDown);
		dom.addEventListener('pointermove', this.onMove);
		dom.addEventListener('pointerup', this.onEnd);
		dom.addEventListener('pointercancel', this.onEnd);
		dom.addEventListener('contextmenu', this.onMenu);
	}

	private down(event: PointerEvent): void {
		if (event.pointerType !== 'touch') {
			this.parts.showHandles(false);
			return;
		}
		this.longPressed = false;
		this.start = { id: event.pointerId, x: event.clientX, y: event.clientY };
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.longPress(), LONG_PRESS_MS);
	}

	private move(event: PointerEvent): void {
		const { start } = this;
		if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) this.cancel();
	}

	private end(event: PointerEvent): void {
		if (this.start?.id !== event.pointerId) return;
		const wasLong = this.longPressed;
		this.cancel();
		// a tap, or a double tap whose word the pointer machine selected from the emulated clicks
		if (!wasLong) queueMicrotask(() => this.parts.showHandles(!this.parts.view.state.selection.empty && event.type === 'pointerup'));
	}

	private cancel(): void {
		clearTimeout(this.timer);
		this.start = null;
	}

	private longPress(): void {
		const { start } = this;
		if (!start) return;
		const { view } = this.parts;
		const { canvas } = view;
		const hit = canvas.geometry.hit(canvas.docPoint({ x: start.x, y: start.y }));
		if (!hit) return;
		this.longPressed = true;
		if (!view.hasFocus()) view.focus();
		const word = canvas.geometry.wordRange(hit.caret);
		const selection =
			word.from === word.to
				? TextSelection.create(view.state.doc, hit.caret.pos)
				: TextSelection.create(view.state.doc, word.from, word.to);
		view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
		this.parts.showHandles(!selection.empty);
	}

	destroy(): void {
		const { dom } = this.parts.view;
		clearTimeout(this.timer);
		dom.removeEventListener('pointerdown', this.onDown);
		dom.removeEventListener('pointermove', this.onMove);
		dom.removeEventListener('pointerup', this.onEnd);
		dom.removeEventListener('pointercancel', this.onEnd);
		dom.removeEventListener('contextmenu', this.onMenu);
	}
}
