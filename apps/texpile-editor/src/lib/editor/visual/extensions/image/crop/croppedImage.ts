// the image as the paper shows it: cut where it is clipped, turned by quarter turns
import { NO_EDITS, drawEdited, loadImage, turned, type ImageEdits } from '$lib/images/edit/imageEdits';
import { cropOfTrim, quarterTurns, readGraphicsCrop } from './graphicsCrop';
import { imageBpSize } from './imageBpSize';

const drawing = new Map<string, Promise<string>>();
const drawn = new Map<string, string>();

/** the edits that draw the image cut by `crop`, then turned `turns` quarters counterclockwise */
export function editsFor(crop: ImageEdits['crop'], turns: number): ImageEdits {
	let edits: ImageEdits = { ...NO_EDITS, crop };
	for (let i = 0; i < turns; i++) edits = turned(edits, 'left');
	return edits;
}

function keyOf(url: string, options: string | null): string | null {
	const { trim, clip, angle } = readGraphicsCrop(options);
	const turns = quarterTurns(angle);
	const cut = clip && trim ? trim.join(' ') : '';
	return cut || turns ? `${url}\n${cut}\n${turns}` : null;
}

async function draw(url: string, options: string | null): Promise<string> {
	const { trim, clip, angle } = readGraphicsCrop(options);
	const image = await loadImage(url);
	const bp = await imageBpSize(url, { w: image.naturalWidth, h: image.naturalHeight });
	const crop = clip ? cropOfTrim(trim, bp.w, bp.h) : NO_EDITS.crop;
	const canvas = drawEdited(image, editsFor(crop, quarterTurns(angle)), true);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	return blob ? URL.createObjectURL(blob) : url;
}

/** what the paper shows for `url` with these options, once drawn; `url` itself when they neither clip nor turn */
export function knownShownUrl(url: string, options: string | null): string | null {
	const key = keyOf(url, options);
	return key ? (drawn.get(key) ?? null) : url;
}

export function shownImageUrl(url: string, options: string | null): Promise<string> {
	const key = keyOf(url, options);
	if (!key) return Promise.resolve(url);
	let hit = drawing.get(key);
	if (!hit) {
		hit = draw(url, options).catch(() => url);
		void hit.then((shown) => drawn.set(key, shown));
		drawing.set(key, hit);
	}
	return hit;
}
