// native drag and drop on the canvas (11.5): handleDOMEvents first, then prosemirror-view's own handlers as ported here
import type { Node as PMNode } from 'prosemirror-model';
import type { VisualView } from '../../contracts/viewTypes';
import { runDomHandlers } from '../../view/domEvents';
import { startDrag } from './dragStart';
import { DropIndicator, dropBarAt } from './dropIndicator';
import { dropPosAt, dropSlice } from './dropSlice';

export type DragSourceHost = {
	/** what the current press may drag */
	dragSource(): { node: PMNode; pos: number } | 'range' | null;
	/** the browser took over the press */
	startNativeDrag(): void;
	/** the press is over: its element is no longer draggable */
	endDrag(): void;
};

const TYPES = ['dragstart', 'dragend', 'dragenter', 'dragover', 'dragleave', 'drop'] as const;
const DRAG_END_DELAY = 50;

export class DragDropListeners {
	private readonly indicator: DropIndicator;

	constructor(
		private readonly view: VisualView,
		private readonly dom: HTMLElement,
		private readonly source: DragSourceHost
	) {
		this.indicator = new DropIndicator(dom.ownerDocument);
		for (const type of TYPES) dom.addEventListener(type, this.listener, true);
	}

	private readonly listener = (event: Event): void => {
		const drag = event as DragEvent;
		// a handler that took the event, or prevented it, leaves the canvas's own default
		if (runDomHandlers(this.view, drag) || drag.defaultPrevented) {
			if (event.type !== 'dragover' && event.type !== 'dragenter') this.indicator.hide();
			return;
		}
		switch (event.type) {
			case 'dragstart':
				return this.dragStart(drag);
			case 'dragend':
				return this.dragEnd();
			case 'dragenter':
			case 'dragover':
				return this.dragOver(drag);
			case 'dragleave':
				if (!(drag.relatedTarget instanceof Node && this.dom.contains(drag.relatedTarget))) this.indicator.hide();
				return;
			case 'drop':
				this.indicator.hide();
				return this.drop(drag);
		}
	};

	private dragStart(event: DragEvent): void {
		const source = this.source.dragSource();
		this.source.startNativeDrag();
		if (source) this.view.dragging = startDrag(this.view, event, source);
		else event.preventDefault();
	}

	private dragEnd(): void {
		const { view } = this;
		const dragging = view.dragging;
		this.indicator.hide();
		this.source.endDrag();
		setTimeout(() => {
			if (view.dragging === dragging) view.dragging = null;
		}, DRAG_END_DELAY);
	}

	private dragOver(event: DragEvent): void {
		if (!this.view.editable) return;
		event.preventDefault();
		const at = dropPosAt(this.view, { x: event.clientX, y: event.clientY });
		const slice = at === null ? null : (this.view.dragging?.slice ?? null);
		this.indicator.show(at === null ? null : dropBarAt(this.view, at, slice));
	}

	private drop(event: DragEvent): void {
		const { view } = this;
		if (!view.editable) return;
		const at = dropPosAt(view, { x: event.clientX, y: event.clientY });
		try {
			if (at !== null) dropSlice(view, event, view.dragging, at);
		} finally {
			view.dragging = null;
			this.source.endDrag();
		}
	}

	destroy(): void {
		for (const type of TYPES) this.dom.removeEventListener(type, this.listener, true);
		this.indicator.hide();
	}
}
