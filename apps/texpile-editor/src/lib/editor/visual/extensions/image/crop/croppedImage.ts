// the image as the paper shows it: cut and turned as its source says
import type { Node as PMNode } from 'prosemirror-model';
import { NO_EDITS, drawEdited, loadImage, turned, type ImageEdits } from '$lib/images/edit/imageEdits';
import { imageBpSize } from './imageBpSize';
import type { ImageCropFormat } from './imageCropFormat';

const drawing = new Map<string, Promise<string>>();
const drawn = new Map<string, string>();

/** the edits that draw the image cut by `crop`, then turned `turns` quarters counterclockwise */
export function editsFor(crop: ImageEdits['crop'], turns: number): ImageEdits {
	let edits: ImageEdits = { ...NO_EDITS, crop };
	for (let i = 0; i < turns; i++) edits = turned(edits, 'left');
	return edits;
}

async function draw(url: string, node: PMNode, format: ImageCropFormat): Promise<string> {
	const image = await loadImage(url);
	const size = await imageBpSize(url, { w: image.naturalWidth, h: image.naturalHeight });
	const { crop, turns } = format.read(node, size);
	const canvas = drawEdited(image, editsFor(crop, turns), true);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	return blob ? URL.createObjectURL(blob) : url;
}

/** what the paper shows for `url`, once drawn; `url` itself for an image its source neither cuts nor turns */
export function knownShownUrl(url: string, node: PMNode, format: ImageCropFormat | undefined): string | null {
	const key = format?.key(node);
	return key ? (drawn.get(`${url}\n${key}`) ?? null) : url;
}

export function shownImageUrl(url: string, node: PMNode, format: ImageCropFormat | undefined): Promise<string> {
	const key = format?.key(node);
	if (!format || !key) return Promise.resolve(url);
	const at = `${url}\n${key}`;
	let hit = drawing.get(at);
	if (!hit) {
		hit = draw(url, node, format).catch(() => url);
		void hit.then((shown) => drawn.set(at, shown));
		drawing.set(at, hit);
	}
	return hit;
}
