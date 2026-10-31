// the image as the paper shows it: cut and turned as its source says
import type { Node as PMNode } from 'prosemirror-model';
import { NO_EDITS, drawEdited, loadImage, turned, type ImageEdits } from '$lib/images/edit/imageEdits';
import { imageBpSize } from './imageBpSize';
import type { ImageCropFormat } from './imageCropFormat';

const drawing = new Map<string, Promise<string>>();
const drawn = new Map<string, string>();
// how often each file changed since it was first drawn, so a draw reads its bytes now and not the browser's copy
const versions = new Map<string, number>();

function fileOf(url: string): string {
	return url.split(/[?&]_=/)[0];
}

function readNow(url: string): string {
	const version = versions.get(fileOf(url));
	return version ? `${url}${url.includes('?') ? '&' : '?'}v=${version}` : url;
}

/** the edits that draw the image cut by `crop`, then turned `turns` quarters counterclockwise */
export function editsFor(crop: ImageEdits['crop'], turns: number): ImageEdits {
	let edits: ImageEdits = { ...NO_EDITS, crop };
	for (let i = 0; i < turns; i++) edits = turned(edits, 'left');
	return edits;
}

async function draw(url: string, node: PMNode, format: ImageCropFormat): Promise<string> {
	const image = await loadImage(readNow(url));
	const size = await imageBpSize(readNow(url), { w: image.naturalWidth, h: image.naturalHeight });
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
		hit = draw(url, node, format);
		hit.then(
			(shown) => drawn.set(at, shown),
			() => drawing.delete(at)
		);
		drawing.set(at, hit);
	}
	return hit.catch(() => url);
}

/** the drawings made of `url`'s file, drawn again once the file changes; one already on screen stays valid there */
export function forgetShown(url: string): void {
	const base = fileOf(url);
	versions.set(base, (versions.get(base) ?? 0) + 1);
	for (const at of [...drawing.keys()]) {
		if (!at.startsWith(`${base}\n`) && !at.startsWith(`${base}?_=`) && !at.startsWith(`${base}&_=`)) continue;
		drawing.delete(at);
		drawn.delete(at);
	}
}
