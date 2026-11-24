// the figure a view is resizing by its handles: drawn at the dragged size, snapped to steps of the column, written on release
import type { Node as PMNode } from 'prosemirror-model';
import type { FaceInputKey, VisualView } from '$lib/editor/canvas';
import { windowInvalidation } from '$lib/editor/canvas';
import { FIGURE_SIZE_STEP } from '../figureDefaults';
import { clamp } from '../imagepluginutils';
import { ResizeDirection, type ImagePluginSettings } from '../types';

export type ImageSizing = { width: number; height: number };
/** the size a drag draws: a side handle sets the width, the top and bottom the height, a corner both */
export type CanvasResize = { pos: number; width: number | null; height: number | null };

export const RESIZE_KEY: FaceInputKey = { kind: 'overlay', key: 'image-resize' };
const sessions = new WeakMap<VisualView, CanvasResize>();

function relay(view: VisualView): void {
	windowInvalidation(view.dom.ownerDocument.defaultView!).fire(RESIZE_KEY);
}

export function resizeAt(view: VisualView, pos: number | undefined): CanvasResize | null {
	const session = sessions.get(view);
	return session && session.pos === pos ? session : null;
}

function snapWidth(width: number, maxWidth: number): number {
	const fraction = Math.min(1, Math.max(FIGURE_SIZE_STEP, width / maxWidth));
	return Math.round(Math.min(1, Math.max(FIGURE_SIZE_STEP, Math.round(fraction / FIGURE_SIZE_STEP) * FIGURE_SIZE_STEP)) * maxWidth);
}

/** the size a drag of `dx`, `dy` from `start` makes: the picture is centered, so a side follows the pointer at twice the pace */
export function draggedSize(
	direction: ResizeDirection,
	start: ImageSizing,
	dx: number,
	dy: number,
	maxWidth: number,
	settings: Pick<ImagePluginSettings, 'minSize' | 'maxSize'>
): { width: number | null; height: number | null } {
	const vertical = direction === ResizeDirection.TOP || direction === ResizeDirection.BOTTOM;
	const corner = !vertical && direction !== ResizeDirection.LEFT && direction !== ResizeDirection.RIGHT;
	const pace = vertical ? 1 : 2;
	function grow(delta: number, toward: RegExp): number {
		return delta * (toward.test(direction) ? -1 : 1) * pace;
	}
	const height = clamp(settings.minSize, Math.round(start.height + grow(dy, /top/i)), settings.maxSize);
	if (vertical) return { width: null, height };
	const aspect = start.width / start.height || 1;
	let width = clamp(settings.minSize, Math.round(start.width + grow(dx, /left/i)), maxWidth);
	if (corner) width = Math.max(width / aspect, settings.minSize) * aspect;
	width = snapWidth(width, maxWidth);
	return { width, height: corner ? Math.round(width / aspect) : null };
}

/** the attrs a released drag writes: the width snapped to the column's steps, the height kept in proportion */
export function resizedAttrs(node: PMNode, drawn: ImageSizing, maxWidth: number): PMNode['attrs'] {
	const width = snapWidth(drawn.width, maxWidth);
	const factor = drawn.width > 0 ? width / drawn.width : 1;
	return { ...node.attrs, width, height: Math.round(drawn.height * factor), maxWidth };
}

/** follows the pointer from a press on a handle until it lets go, and writes the size then */
export function dragResize(
	view: VisualView,
	pos: number,
	direction: ResizeDirection,
	press: { x: number; y: number },
	settings: ImagePluginSettings
): void {
	const shown = view.canvas.geometry.partRect(pos, 'picture');
	const block = view.canvas.geometry.nodeRect(pos)?.rect;
	if (!shown || !block) return;
	const start = { width: shown.width || settings.minSize, height: shown.height || settings.minSize };
	const maxWidth = Math.min(Math.max(block.width, settings.minSize), settings.maxSize);
	let drawn = start;
	const doc = view.dom.ownerDocument;
	function move(event: MouseEvent): void {
		event.preventDefault();
		const size = draggedSize(direction, start, event.clientX - press.x, event.clientY - press.y, maxWidth, settings);
		drawn = { width: size.width ?? start.width, height: size.height ?? start.height };
		sessions.set(view, { pos, ...size });
		relay(view);
	}
	function release(event: MouseEvent): void {
		event.preventDefault();
		doc.removeEventListener('mousemove', move);
		sessions.delete(view);
		relay(view);
		const node = view.state.doc.nodeAt(pos);
		if (node?.type.name === 'image' && drawn !== start)
			view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, resizedAttrs(node, drawn, maxWidth)));
	}
	doc.addEventListener('mousemove', move);
	doc.addEventListener('mouseup', release, { once: true });
}
