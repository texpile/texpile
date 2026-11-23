// where a drop lands while a drag is over the page: a 2px bar at a place in the text, or a line between blocks
import type { Slice } from 'prosemirror-model';
import { dropPoint } from 'prosemirror-transform';
import type { VisualView } from '../../contracts/viewTypes';

const WIDTH = 2;

export type DropBar = { left: number; top: number; width: number; height: number };

/** the bar for a drop at `at`, client px; null when the drop has no place to go */
export function dropBarAt(view: VisualView, at: number, slice: Slice | null): DropBar | null {
	const { doc } = view.state;
	const pos = (slice && dropPoint(doc, at, slice)) ?? at;
	const $pos = doc.resolve(pos);
	if ($pos.parent.inlineContent) {
		const caret = view.canvas.geometry.caretRect({ pos, affinity: 1 });
		if (!caret) return null;
		const rect = view.canvas.clientRect(caret);
		return { left: rect.left - WIDTH / 2, top: rect.top, width: WIDTH, height: rect.height };
	}
	const after = $pos.nodeAfter ? view.canvas.nodeClientRect(pos)?.rect : null;
	const before = !after && $pos.nodeBefore ? view.canvas.nodeClientRect(pos - $pos.nodeBefore.nodeSize)?.rect : null;
	const block = after ?? before;
	if (!block) return null;
	const y = after ? after.top : block.bottom;
	return { left: block.left, top: y - WIDTH / 2, width: block.width, height: WIDTH };
}

export class DropIndicator {
	private bar: HTMLElement | null = null;

	constructor(private readonly doc: Document) {}

	show(at: DropBar | null): void {
		if (!at) return this.hide();
		const root = this.doc.documentElement;
		// the block handle draws its own drop line, and a refused drop shows none
		if (root.classList.contains('pm-handle-drag') || root.classList.contains('pm-drop-refused')) return this.hide();
		const bar = (this.bar ??= this.doc.body.appendChild(this.doc.createElement('div')));
		bar.className = 'canvas-drop-indicator';
		Object.assign(bar.style, {
			position: 'fixed',
			pointerEvents: 'none',
			zIndex: '50',
			backgroundColor: 'var(--color-primary-500)',
			left: `${at.left}px`,
			top: `${at.top}px`,
			width: `${at.width}px`,
			height: `${at.height}px`
		});
	}

	hide(): void {
		this.bar?.remove();
		this.bar = null;
	}
}
