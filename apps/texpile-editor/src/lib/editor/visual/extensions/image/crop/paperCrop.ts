// crop mode for one image in the paper, mounted in its node view and written back into its source
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import PaperCropper from './PaperCropper.svelte';
import type { ImageCrop, ImageCropFormat, ImageSize } from './imageCropFormat';

export const START_IMAGE_CROP = 'texpile:start-image-crop';

export type PaperCropTarget = {
	root: HTMLElement;
	/** the whole image, before any trim */
	url: string;
	shownWidth: number;
	maxWidth: number;
	view: EditorView;
	getPos: () => number | undefined;
	format: ImageCropFormat;
};

/** shows the cropper over the image until Done or Cancel; the returned function ends it */
export function startPaperCrop(target: PaperCropTarget, onend: () => void): () => void {
	const pos = target.getPos();
	const node = pos === undefined ? null : target.view.state.doc.nodeAt(pos);
	if (pos === undefined || !node) return () => {};
	const host = document.createElement('div');
	host.contentEditable = 'false';
	target.root.insertBefore(host, target.root.querySelector(':scope > img'));
	target.root.classList.add('image-cropping');
	let ended = false;
	function end(): void {
		if (ended) return;
		ended = true;
		void unmount(cropper);
		host.remove();
		target.root.classList.remove('image-cropping');
		onend();
	}
	function done(crop: ImageCrop, size: ImageSize): void {
		const at = target.getPos();
		const now = at === undefined ? null : target.view.state.doc.nodeAt(at);
		if (at !== undefined && now) {
			const tr = target.view.state.tr.setNodeMarkup(at, undefined, target.format.write(now, crop, size));
			target.format.prepare?.(tr);
			target.view.dispatch(tr);
		}
		end();
		target.view.focus();
	}
	function read(size: ImageSize): ImageCrop {
		return target.format.read(node!, size);
	}
	const cropper = mount(PaperCropper, {
		target: host,
		props: { url: target.url, read, shownWidth: target.shownWidth, maxWidth: target.maxWidth, ondone: done, oncancel: end }
	});
	return end;
}
