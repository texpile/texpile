// a press on the canvas, captured ahead of the generic handleDOMEvents listener, and the pointer over it without a button
import type { EditorView } from 'prosemirror-view';
import type { CanvasPointerEvent } from '../contracts/faceTypes';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import type { CanvasSurface } from '../frame/surface';
import type { CanvasStyles } from '../contracts/styleTypes';
import type { VisualView } from '../contracts/viewTypes';
import { ViewTouch } from './viewTouch';
import { hoverHint } from '$lib/components/tooltip.svelte';
import type { HoverTracker } from '../interaction/hover/hoverState.svelte';
import { PointerHover } from '../interaction/hover/pointerHover';
import { pageScrollTarget } from '../interaction/pointer/pageScrollTarget';
import { PointerMachine } from '../interaction/pointer/pointerMachine';
import { sideScroll } from '../interaction/pointer/sideScroll';
import { retargetPointerEvent, runDomHandlers } from './domEvents';
import { DragDropListeners } from '../interaction/dragDrop/dragDropListeners';
import type { CanvasViewRoot } from './viewRoot';
import { FaceElement } from '../tree/faceElement';

/** the element nearest the hovered one whose look has a hover state, itself or an ancestor */
function hoverLookOwner(element: FaceElement): FaceElement | null {
	for (let at: FaceElement | null = element; at; at = at.parentNode instanceof FaceElement ? at.parentNode : null)
		if (at.states?.hover) return at;
	return null;
}

export type PressParts = {
	readonly exposed: EditorView;
	readonly root: CanvasViewRoot;
	readonly hover: HoverTracker;
	/** an element's hover state, which its hover look reads */
	readonly styles: Pick<CanvasStyles, 'setState'>;
	requestFrame(): void;
	/** a press ends a composition first */
	endComposition(): void;
	/** view.dom: presses on its canvases start here */
	readonly dom: HTMLElement;
	readonly surface: CanvasSurface;
	geometry(): CanvasGeometry;
};

// the default of button 1 is the browser's autoscroll (Windows) or the PRIMARY paste (Linux)
export function pressPreventsDefault(event: MouseEvent, handled: boolean): boolean {
	return handled && event.button !== 1;
}

export class PressRouting {
	private readonly pointer: PointerMachine;
	private readonly hover: PointerHover;
	private readonly touch: ViewTouch;
	private readonly unframe: () => void;
	private readonly drags: DragDropListeners;
	/** the canvas element a press made draggable, for the browser to start a native drag from */
	private dragElement: HTMLElement | null = null;
	/** a handler took the middle press: Chromium pastes PRIMARY on the release unless it is prevented too */
	private middleTaken = false;
	private readonly onDown = (event: MouseEvent): void => {
		if (this.parts.surface.isCanvas(event.target)) this.press(event);
	};
	private readonly onLeave = (): void => this.hover.clear();
	// passive: a listener that may cancel the wheel moves Chromium's scrolling onto the main thread. The pane never scrolls
	// sideways, so a box taking the sideways wheel leaves it nothing to move
	private readonly onWheel = (event: WheelEvent): void => {
		const { parts } = this;
		if (sideScroll(event, parts.geometry(), parts.surface.docPoint({ x: event.clientX, y: event.clientY }))) parts.requestFrame();
	};
	private readonly onMove = (event: MouseEvent): void => this.move(event);
	private readonly onUp = (event: MouseEvent): void => this.release(event);

	constructor(private readonly parts: PressParts) {
		const { exposed } = parts;
		const doc = parts.dom.ownerDocument;
		this.pointer = new PointerMachine(exposed, {
			retarget: (event, hit) => retargetPointerEvent(event, hit) as CanvasPointerEvent,
			mousedown: (event) => runDomHandlers(exposed, event),
			endComposition: parts.endComposition,
			scrollTargets: () => [pageScrollTarget(parts.surface.scroller())],
			replay: (point) =>
				this.move(new MouseEvent('mousemove', { clientX: point.x, clientY: point.y, buttons: 1, bubbles: true, view: doc.defaultView }))
		});
		this.hover = new PointerHover({
			dom: parts.dom,
			hover: parts.hover,
			doc: () => exposed.state.doc,
			hit: (client) => parts.geometry().hit(parts.surface.docPoint(client)),
			setElementHover: (element, on) => {
				parts.styles.setState(element, 'hover', on);
				// a hover look changes what its block draws, and the block keeps its drawing until something in it changes
				hoverLookOwner(element)?.noteMutation();
				parts.requestFrame();
			},
			showHint: (hint) => hoverHint(hint && { ...hint, win: doc.defaultView! }),
			hintRect: (hit, element) => {
				if (hit.inside < 0) return null;
				const geometry = parts.geometry();
				const rect = element.anchor ? geometry.partRect(hit.inside, element.anchor) : geometry.nodeRect(hit.inside)?.rect;
				return rect ? parts.surface.clientRect(rect) : null;
			}
		});
		parts.dom.addEventListener('mouseleave', this.onLeave);
		parts.dom.addEventListener('wheel', this.onWheel, { passive: true });
		this.touch = new ViewTouch(exposed as unknown as VisualView);
		this.unframe = (exposed as unknown as VisualView).canvas.onFrame(() => this.touch.place());
		parts.dom.addEventListener('mousedown', this.onDown, true);
		this.drags = new DragDropListeners(exposed as unknown as VisualView, parts.dom, {
			dragSource: () => this.pointer.dragSource(),
			startNativeDrag: () => this.pointer.startNativeDrag(),
			endDrag: () => this.endDrag()
		});
		doc.addEventListener('mousemove', this.onMove);
		doc.addEventListener('mouseup', this.onUp);
	}

	retarget(event: MouseEvent): MouseEvent | CanvasPointerEvent {
		return retargetPointerEvent(event, this.parts.geometry().hit(this.parts.surface.docPoint({ x: event.clientX, y: event.clientY })));
	}

	/** the pointer machine runs face handlers, then handleDOMEvents.mousedown, then its own click rules */
	press(event: MouseEvent): void {
		this.hover.hideHint();
		const handled = this.pointer.press(event);
		this.middleTaken = event.button === 1 && event.defaultPrevented;
		this.endDrag();
		// a press that prevents its default starts no native drag
		if (this.pointer.dragSource() && event.target instanceof HTMLElement) {
			this.dragElement = event.target;
			this.dragElement.draggable = true;
		} else if (pressPreventsDefault(event, handled)) event.preventDefault();
	}

	private endDrag(): void {
		if (this.dragElement) this.dragElement.draggable = false;
		this.dragElement = null;
	}

	move(event: MouseEvent): void {
		const { root } = this.parts;
		if (root.listening('mousemove')) root.dispatchEvent(this.retarget(event) as unknown as Event);
		this.pointer.move(event);
		if (event.buttons === 0 && this.parts.surface.isCanvas(event.target)) this.hover.move(event);
	}

	release(event: MouseEvent): void {
		const { root } = this.parts;
		if (root.listening('mouseup')) root.dispatchEvent(this.retarget(event) as unknown as Event);
		this.pointer.release(event);
		// the press that armed a drag kept its default, which blurs the textarea surface
		if (this.dragElement && !this.parts.exposed.hasFocus()) this.parts.exposed.focus();
		this.endDrag();
		if (event.button === 1 && this.middleTaken) event.preventDefault();
		this.middleTaken = false;
	}

	destroy(): void {
		const doc = this.parts.dom.ownerDocument;
		doc.removeEventListener('mousemove', this.onMove);
		doc.removeEventListener('mouseup', this.onUp);
		this.parts.dom.removeEventListener('mousedown', this.onDown, true);
		this.parts.dom.removeEventListener('mouseleave', this.onLeave);
		this.parts.dom.removeEventListener('wheel', this.onWheel);
		this.hover.destroy();
		this.drags.destroy();
		this.unframe();
		this.touch.destroy();
	}
}
