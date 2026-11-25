// view.root: what prosemirror-tables' cell drag listens on, fed with a press's retargeted events (2.3)
import type { ViewRoot } from '../contracts/viewTypes';

type RootListener = EventListenerOrEventListenerObject;

export class CanvasViewRoot implements ViewRoot {
	private readonly listeners = new Map<string, RootListener[]>();

	constructor(private readonly dom: HTMLElement) {}

	get activeElement(): Element | null {
		return this.dom.ownerDocument.activeElement;
	}

	getSelection(): ReturnType<Document['getSelection']> {
		return this.dom.ownerDocument.getSelection();
	}

	elementFromPoint(x: number, y: number): Element | null {
		return this.dom.ownerDocument.elementFromPoint(x, y);
	}

	addEventListener(type: string, listener: RootListener | null): void {
		if (!listener) return;
		const list = this.listeners.get(type) ?? [];
		if (!list.includes(listener)) list.push(listener);
		this.listeners.set(type, list);
	}

	removeEventListener(type: string, listener: RootListener | null): void {
		const list = this.listeners.get(type);
		if (list && listener)
			this.listeners.set(
				type,
				list.filter((l) => l !== listener)
			);
	}

	/** runs the listeners on the event as given, retargeted or not; a listener may remove itself while it runs */
	dispatchEvent(event: Event): boolean {
		for (const listener of [...(this.listeners.get(event.type) ?? [])])
			if (typeof listener === 'function') listener.call(this, event);
			else listener.handleEvent(event);
		return !event.defaultPrevented;
	}

	/** whether anything listens, so a press feeds the root only while a library holds a drag */
	listening(type: string): boolean {
		return !!this.listeners.get(type)?.length;
	}
}
