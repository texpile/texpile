// the visual editor's selectionchange (11.9): a bubbling canvasselectionchange on view.dom and the onSelection listeners
import type { Selection } from 'prosemirror-state';

export const SELECTION_EVENT = 'canvasselectionchange';

export class SelectionSignal {
	private readonly listeners = new Set<(selection: Selection) => void>();

	constructor(private readonly dom: HTMLElement) {}

	listen(listener: (selection: Selection) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** after an update; nothing when the selection did not change */
	update(previous: Selection, next: Selection): void {
		if (previous.eq(next)) return;
		this.dom.dispatchEvent(new Event(SELECTION_EVENT, { bubbles: true }));
		for (const listener of this.listeners) listener(next);
	}
}
