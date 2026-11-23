// the figure a view is cropping in the paper, and the room its cropper takes: the picture's place gives way to it
import type { Node as PMNode } from 'prosemirror-model';
import type { FaceInputKey, VisualView } from '$lib/editor/canvas';
import { windowInvalidation } from '$lib/editor/canvas';
import type { ImageCrop, ImageCropFormat, ImageSize } from '../crop/imageCropFormat';

export type CanvasCrop = { pos: number; url: string; shownWidth: number; maxWidth: number; height: number; format: ImageCropFormat };

export const CROP_KEY: FaceInputKey = { kind: 'overlay', key: 'image-crop' };
const sessions = new WeakMap<VisualView, CanvasCrop>();

function relay(view: VisualView): void {
	windowInvalidation(view.dom.ownerDocument.defaultView!).fire(CROP_KEY);
}

export function cropAt(view: VisualView, pos: number | undefined): CanvasCrop | null {
	const session = sessions.get(view);
	return session && session.pos === pos ? session : null;
}

export function startCanvasCrop(view: VisualView, crop: CanvasCrop): void {
	sessions.set(view, crop);
	relay(view);
}

export function endCanvasCrop(view: VisualView): void {
	if (!sessions.delete(view)) return;
	relay(view);
	view.focus();
}

/** the cropper's own height, which its slot in the column takes */
export function noteCropHeight(view: VisualView, height: number): void {
	const session = sessions.get(view);
	if (!session || Math.abs(session.height - height) < 0.5) return;
	session.height = height;
	relay(view);
}

export function finishCanvasCrop(view: VisualView, result: ImageCrop, size: ImageSize): void {
	const session = sessions.get(view);
	const node: PMNode | null | undefined = session && view.state.doc.nodeAt(session.pos);
	if (session && node?.type.name === 'image') {
		const tr = view.state.tr.setNodeMarkup(session.pos, undefined, session.format.write(node, result, size));
		session.format.prepare?.(tr);
		view.dispatch(tr);
	}
	endCanvasCrop(view);
}
