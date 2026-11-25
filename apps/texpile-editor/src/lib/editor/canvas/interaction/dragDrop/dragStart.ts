// prosemirror-view's dragstart on the canvas: the node or the selection as the clipboard writes it, and a drag image of
// its words, since the canvas element the browser would picture is the whole row
import { NodeSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { ViewDragging, VisualView } from '../../contracts/viewTypes';
import { dragMoves } from './dropSlice';

const IMAGE_LINES = 3;

/** the words dragged, at 75% alpha by the pointer's corner; kept in the document only while the browser snapshots it */
function showDragImage(event: DragEvent, text: string): void {
	const doc = (event.target as Node | null)?.ownerDocument;
	if (!doc || !event.dataTransfer || !text.trim()) return;
	const image = doc.body.appendChild(doc.createElement('div'));
	image.className = 'canvas-drag-image';
	image.textContent = text.split('\n').filter(Boolean).slice(0, IMAGE_LINES).join('\n');
	Object.assign(image.style, {
		position: 'fixed',
		top: '-1000px',
		left: '0',
		maxWidth: '420px',
		whiteSpace: 'pre-wrap',
		overflow: 'hidden',
		maxHeight: '96px',
		padding: '2px 4px',
		opacity: '0.75',
		font: '14px var(--base-font-family, sans-serif)',
		pointerEvents: 'none'
	});
	event.dataTransfer.setDragImage(image, 0, 0);
	setTimeout(() => image.remove());
}

/** `source` is what the press may drag: a node it is on, or the selection it is in; returns what view.dragging holds */
export function startDrag(view: VisualView, event: DragEvent, source: { node: PMNode; pos: number } | 'range'): ViewDragging | null {
	const transfer = event.dataTransfer;
	if (!transfer) return null;
	const node = source === 'range' ? undefined : NodeSelection.create(view.state.doc, source.pos);
	const { dom, text, slice } = view.serializeForClipboard((node ?? view.state.selection).content());
	transfer.clearData();
	transfer.setData('text/html', dom.innerHTML);
	transfer.effectAllowed = 'copyMove';
	transfer.setData('text/plain', text);
	showDragImage(event, text);
	return { slice, move: dragMoves(view, event), node };
}
