// a figure's HTML on the canvas: the resize frame while it is pointed at, the cropper in its place, and Crop for the
// bar over the selected image
import type { Node as PMNode } from 'prosemirror-model';
import { Crop } from '@lucide/svelte';
import type { BlockAction, FaceUiState, OverlaySpec, VisualView } from '$lib/editor/canvas';
import { m } from '$lib/paraglide/messages';
import { graphicsCropReadable } from '../crop/graphicsCrop';
import { latexCropFormat } from '../crop/latexCropFormat';
import type { ImagePluginSettings } from '../types';
import CanvasPaperCrop from './CanvasPaperCrop.svelte';
import ImageResizeFrame from './ImageResizeFrame.svelte';
import { endCanvasCrop, finishCanvasCrop, noteCropHeight, startCanvasCrop, type CanvasCrop } from './imageCrop';
import type { Picture } from './imagePicture';
import { dragResize, resizeAt } from './imageResize';
import type { ResizeDirection } from '../types';

export type ImageOverlayParts = {
	view: VisualView;
	getPos(): number | undefined;
	node: PMNode;
	settings: ImagePluginSettings;
	picture: Picture;
	crop: CanvasCrop | null;
};

function startCrop({ view, getPos, settings, picture }: ImageOverlayParts): void {
	const pos = getPos();
	const format = settings.cropFormat;
	if (pos === undefined || !format || picture.state !== 'ready') return;
	const shown = view.canvas.geometry.partRect(pos, 'picture');
	const block = view.canvas.geometry.nodeRect(pos)?.rect;
	startCanvasCrop(view, {
		pos,
		url: picture.url,
		shownWidth: shown?.width ?? picture.width,
		maxWidth: (block?.width ?? picture.width) - settings.imageMargin * 2,
		height: shown?.height ?? picture.height,
		format
	});
}

function pressHandle({ view, getPos, settings }: ImageOverlayParts, direction: ResizeDirection, event: MouseEvent): void {
	const pos = getPos();
	if (pos !== undefined) dragResize(view, pos, direction, { x: event.clientX, y: event.clientY }, settings);
}

/** the overlays a figure offers, their props made once so the layer keeps them mounted */
export function imageOverlays(parts: ImageOverlayParts): (ui: FaceUiState) => readonly OverlaySpec[] {
	const { view, node, settings, picture, crop } = parts;
	if (crop) {
		const cropper: OverlaySpec = {
			key: 'crop',
			component: CanvasPaperCrop,
			props: {
				url: crop.url,
				read: (size: Parameters<typeof crop.format.read>[1]) => crop.format.read(node, size),
				shownWidth: crop.shownWidth,
				maxWidth: crop.maxWidth,
				ondone: (...done: Parameters<typeof finishCanvasCrop> extends [unknown, ...infer R] ? R : never) => finishCanvasCrop(view, ...done),
				oncancel: () => endCanvasCrop(view),
				onheight: (height: number) => noteCropHeight(view, height)
			},
			anchor: { part: 'crop' },
			placement: 'inFlow',
			when: 'always'
		};
		return () => [cropper];
	}
	if (picture.state !== 'ready') return () => [];
	const resizing = resizeAt(view, parts.getPos()) !== null;
	const frame: OverlaySpec | null = settings.enableResize
		? {
				key: 'resize',
				component: ImageResizeFrame,
				props: { onpress: (direction: ResizeDirection, event: MouseEvent) => pressHandle(parts, direction, event) },
				anchor: { part: 'picture' },
				placement: 'inFlow',
				when: resizing ? 'always' : 'hovered'
			}
		: null;
	return (ui) => (ui.readOnly || !frame ? [] : [frame]);
}

/** Crop, in the bar over the selected image, while the crop options are ones the cropper can read back */
export function imageActions(parts: ImageOverlayParts): readonly BlockAction[] {
	const { node, settings, picture, crop } = parts;
	if (!settings.cropFormat || crop || picture.state !== 'ready') return [];
	const options = typeof node.attrs.options === 'string' ? node.attrs.options : null;
	if (settings.cropFormat === latexCropFormat && !graphicsCropReadable(options)) return [];
	return [{ key: 'crop', label: m.imageoverlay_crop(), icon: Crop, run: () => startCrop(parts) }];
}
