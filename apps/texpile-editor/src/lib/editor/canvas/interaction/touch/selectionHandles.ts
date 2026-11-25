// the two drawn teardrops at the ends of a touch selection (D37); a drag moves one end and the other stays
import { TextSelection } from 'prosemirror-state';
import type { VisualView } from '../../contracts/viewTypes';

const SIZE_PX = 20;
/** the finger sits below the drop: the caret under the pointer is the one a little above it */
const LIFT_PX = 18;

type Side = 'start' | 'end';

function dropOf(doc: Document, side: Side): HTMLElement {
	const drop = doc.createElement('div');
	drop.setAttribute('data-canvas-handle', side);
	drop.style.cssText = `position:fixed;z-index:50;width:${SIZE_PX}px;height:${SIZE_PX}px;touch-action:none;display:none;background:var(--color-primary-500);border-radius:0 50% 50% 50%;transform:rotate(45deg);margin:0 0 0 -${SIZE_PX / 2}px`;
	return drop;
}

export class SelectionHandles {
	private readonly drops: Record<Side, HTMLElement>;
	private visible = false;
	private dragging: { side: Side; fixed: number } | null = null;

	constructor(private readonly view: VisualView) {
		const doc = view.dom.ownerDocument;
		this.drops = { start: dropOf(doc, 'start'), end: dropOf(doc, 'end') };
		for (const side of ['start', 'end'] as const) {
			const drop = this.drops[side];
			doc.body.append(drop);
			drop.addEventListener('pointerdown', (event) => this.grab(event, side));
			drop.addEventListener('pointermove', (event) => this.drag(event));
			drop.addEventListener('pointerup', () => this.release());
			drop.addEventListener('pointercancel', () => this.release());
		}
	}

	show(on: boolean): void {
		this.visible = on;
		this.place();
	}

	/** after a frame or a selection change: the drops follow the range ends */
	place(): void {
		const { selection } = this.view.state;
		const shown = this.visible && selection instanceof TextSelection && !selection.empty;
		for (const side of ['start', 'end'] as const) {
			const drop = this.drops[side];
			drop.style.display = shown ? 'block' : 'none';
			if (!shown) continue;
			const rect = this.view.coordsAtPos(side === 'start' ? selection.from : selection.to);
			drop.style.left = `${rect.left}px`;
			drop.style.top = `${rect.bottom + 2}px`;
		}
	}

	// a touch pointer is captured by the element it landed on
	private grab(event: PointerEvent, side: Side): void {
		const { selection } = this.view.state;
		this.dragging = { side, fixed: side === 'start' ? selection.to : selection.from };
		event.preventDefault();
	}

	private drag(event: PointerEvent): void {
		const { dragging, view } = this;
		if (!dragging) return;
		const { canvas } = view;
		const hit = canvas.geometry.hit(canvas.docPoint({ x: event.clientX, y: event.clientY - LIFT_PX }));
		if (!hit || hit.caret.pos === dragging.fixed) return;
		const selection = TextSelection.create(view.state.doc, dragging.fixed, hit.caret.pos);
		if (!view.state.selection.eq(selection)) view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
	}

	private release(): void {
		this.dragging = null;
	}

	destroy(): void {
		this.drops.start.remove();
		this.drops.end.remove();
	}
}
