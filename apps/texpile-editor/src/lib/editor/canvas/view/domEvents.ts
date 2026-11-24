// handleDOMEvents (2.3): listeners for the types plugins name, retargeted pointer events and the hit behind them
import type { EditorView } from 'prosemirror-view';
import type { CanvasPointerEvent } from '../contracts/faceTypes';
import type { CanvasHit } from '../contracts/geometryTypes';
import type { RetargetedEvent } from '../contracts/nodeViewTypes';
import type { FaceElement } from '../tree/faceElement';
import type { ClipboardController } from '../interaction/clipboard/clipboardController';
import type { KeyRouter } from '../interaction/keys/keyRouter';
import type { PressRouting } from './pressRouting';

/** events a controller already ran the handlers for, at its own point in prosemirror-view's order */
const handled = new WeakSet<Event>();
const hits = new WeakMap<object, CanvasHit>();
const originals = new WeakMap<object, Event>();
/** these do not bubble, so view.dom hears them from its input surface in the capture phase */
const CAPTURED = new Set(['focus', 'blur']);

function realEventOf(event: Event): Event {
	return originals.get(event) ?? event;
}

/** prosemirror-view's runCustomHandler, for the canvas controllers; the generic listener then skips the event */
export function runDomHandlers(view: EditorView, delivered: Event | CanvasPointerEvent): boolean {
	const event = delivered as Event;
	handled.add(realEventOf(event));
	return !!view.someProp('handleDOMEvents', (handlers) => {
		const handler = (handlers as Record<string, ((view: EditorView, event: Event) => boolean | void) | undefined>)[event.type];
		return handler ? handler(view, event) || event.defaultPrevented : false;
	});
}

/** a real event whose target is a face element; preventDefault and the rest reach the real event */
export function retargetEvent<E extends Event>(event: E, target: FaceElement): RetargetedEvent<E> {
	const retargeted = new Proxy(event, {
		get(real, key) {
			if (key === 'target') return target;
			const value: unknown = Reflect.get(real, key, real);
			return typeof value === 'function' ? value.bind(real) : value;
		}
	}) as unknown as RetargetedEvent<E>;
	originals.set(retargeted, event);
	return retargeted;
}

/** a real mouse event whose target is the innermost hit element */
export function retargetPointerEvent(event: MouseEvent, hit: CanvasHit | null): MouseEvent | CanvasPointerEvent {
	const target = hit?.chain[0];
	if (!hit || !target) return event;
	const retargeted = retargetEvent(event, target);
	hits.set(retargeted, hit);
	hits.set(event, hit);
	return retargeted;
}

/** the full hit behind a pointer event the canvas delivered, for Texpile handlers */
export function hitOf(event: Event): CanvasHit | null {
	return hits.get(event) ?? hits.get(realEventOf(event)) ?? null;
}

const CLIPBOARD_EVENTS = new Set(['copy', 'cut', 'paste']);

export type OwnEventRoutes = {
	readonly exposed: EditorView;
	readonly keys: KeyRouter;
	readonly presses: PressRouting;
	readonly clipboard: ClipboardController;
};

/** view.dispatchEvent: the canvas's own handler for the type, keys to the router, mouse to the press, clipboard to its controller */
export function dispatchOwnEvent(event: Event, routes: OwnEventRoutes): void {
	if (event instanceof KeyboardEvent && event.type === 'keydown') {
		if (routes.keys.keydown(event)) event.preventDefault();
	} else if (event.type === 'mousedown') routes.presses.press(event as MouseEvent);
	else if (event.type === 'mousemove') routes.presses.move(event as MouseEvent);
	else if (event.type === 'mouseup') routes.presses.release(event as MouseEvent);
	else if (CLIPBOARD_EVENTS.has(event.type)) routes.clipboard.handle(event as ClipboardEvent);
	else runDomHandlers(routes.exposed, event);
}

export class DomEventListeners {
	private readonly listening = new Set<string>();

	constructor(
		private readonly dom: HTMLElement,
		private readonly view: EditorView,
		/** pointer events from the canvases get their hit and target */
		private readonly retarget: (event: MouseEvent) => MouseEvent | CanvasPointerEvent,
		private readonly isCanvas: (target: EventTarget | null) => boolean
	) {}

	private readonly listener = (event: Event): void => {
		if (handled.has(event)) return;
		const delivered = event instanceof MouseEvent && this.isCanvas(event.target) ? this.retarget(event) : event;
		runDomHandlers(this.view, delivered);
	};

	/** prosemirror-view's ensureListeners: one listener for each type a handleDOMEvents prop names */
	ensure(): void {
		this.view.someProp('handleDOMEvents', (handlers) => {
			for (const type of Object.keys(handlers))
				if (!this.listening.has(type)) {
					this.listening.add(type);
					this.dom.addEventListener(type, this.listener, CAPTURED.has(type));
				}
			return undefined;
		});
	}

	destroy(): void {
		for (const type of this.listening) this.dom.removeEventListener(type, this.listener, CAPTURED.has(type));
		this.listening.clear();
	}
}
