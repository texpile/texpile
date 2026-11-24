// a pointer over the canvas without a button (11.7): one hit per frame sets the cursor, the hover state and the hint
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasHit } from '../../contracts/geometryTypes';
import type { FaceElement } from '../../tree/faceElement';
import type { HoverTracker } from './hoverState.svelte';
import { hoverStateOf, sameHover } from './hoverTargets';

export type PointerHoverParts = {
	/** the element whose cursor shows: view.dom */
	readonly dom: HTMLElement;
	readonly hover: HoverTracker;
	doc(): PMNode;
	hit(client: { x: number; y: number }): CanvasHit | null;
	/** the hover state of one element, which the style mirror carries to the elements the sheets' :hover rules match */
	setElementHover(element: FaceElement, on: boolean): void;
	/** a hint to show after the app's tooltip delay at the rect, or none */
	showHint(hint: { text: string; rect: DOMRect } | null): void;
	/** the client rect of what the hint belongs to */
	hintRect(hit: CanvasHit, element: FaceElement): DOMRect | null;
};

export class PointerHover {
	private point: { x: number; y: number } | null = null;
	private frame = 0;
	private hovered: FaceElement | null = null;

	constructor(private readonly parts: PointerHoverParts) {}

	move(event: MouseEvent): void {
		this.point = { x: event.clientX, y: event.clientY };
		const win = this.parts.dom.ownerDocument.defaultView;
		if (!this.frame && win) this.frame = win.requestAnimationFrame(() => this.update());
	}

	hideHint(): void {
		this.parts.showHint(null);
	}

	/** the pointer left the canvas: nothing is hovered */
	clear(): void {
		this.point = null;
		this.apply(null);
	}

	destroy(): void {
		if (this.frame) this.parts.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.clear();
	}

	private update(): void {
		this.frame = 0;
		if (this.point) this.apply(this.parts.hit(this.point));
	}

	private apply(hit: CanvasHit | null): void {
		const { parts } = this;
		const cursor = hit?.cursor ?? 'default';
		if (parts.dom.style.cursor !== cursor) parts.dom.style.cursor = cursor;
		const next = hoverStateOf(hit, parts.doc());
		if (sameHover(parts.hover, next)) return;
		parts.hover.update(next);
		this.carryState(next.chain[0] ?? null);
		const holder = hit?.chain.find((element) => element.hint) ?? null;
		const rect = hit && holder ? parts.hintRect(hit, holder) : null;
		parts.showHint(holder?.hint && rect ? { text: holder.hint, rect } : null);
	}

	private carryState(innermost: FaceElement | null): void {
		if (innermost === this.hovered) return;
		if (this.hovered) this.parts.setElementHover(this.hovered, false);
		this.hovered = innermost;
		if (innermost) this.parts.setElementHover(innermost, true);
	}
}
