// an image's edits as the image tab makes them: a turn and flips on screen, a crop of what that shows, a smaller width
import { UNCROPPED, flipCrop, isUncropped, turnCrop, type Crop } from '../crop/cropGeometry';
import { m } from '$lib/paraglide/messages';

/** a quarter turn or flip as canvas's transform(a, b, c, d) takes it */
type Orientation = [number, number, number, number];

export type ImageEdits = { orientation: Orientation; crop: Crop; width: number | null };

export const NO_EDITS: ImageEdits = { orientation: [1, 0, 0, 1], crop: UNCROPPED, width: null };

const TURN_RIGHT: Orientation = [0, 1, -1, 0];
const TURN_LEFT: Orientation = [0, -1, 1, 0];
const FLIP_X: Orientation = [-1, 0, 0, 1];
const FLIP_Y: Orientation = [1, 0, 0, -1];

/** `then` applied after `first` */
function compose([a, b, c, d]: Orientation, [e, f, g, h]: Orientation): Orientation {
	return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h];
}

export function turned(edits: ImageEdits, dir: 'left' | 'right'): ImageEdits {
	return { ...edits, orientation: compose(dir === 'right' ? TURN_RIGHT : TURN_LEFT, edits.orientation), crop: turnCrop(edits.crop, dir) };
}

export function flipped(edits: ImageEdits, axis: 'x' | 'y'): ImageEdits {
	return { ...edits, orientation: compose(axis === 'x' ? FLIP_X : FLIP_Y, edits.orientation), crop: flipCrop(edits.crop, axis) };
}

export function isUnedited(edits: ImageEdits): boolean {
	const [a, b, c, d] = edits.orientation;
	return a === 1 && b === 0 && c === 0 && d === 1 && isUncropped(edits.crop) && edits.width === null;
}

/** the size the image shows at after its turn, before its crop */
export function orientedSize(edits: ImageEdits, w: number, h: number): { w: number; h: number } {
	return edits.orientation[0] === 0 ? { w: h, h: w } : { w, h };
}

/** the size the edits make, its crop and width applied */
export function editedSize(edits: ImageEdits, w: number, h: number): { w: number; h: number } {
	const o = orientedSize(edits, w, h);
	const cw = Math.max(1, Math.round(o.w * (1 - edits.crop.l - edits.crop.r)));
	const ch = Math.max(1, Math.round(o.h * (1 - edits.crop.t - edits.crop.b)));
	const k = edits.width && edits.width < cw ? edits.width / cw : 1;
	return { w: Math.max(1, Math.round(cw * k)), h: Math.max(1, Math.round(ch * k)) };
}

/** the image drawn with its edits; `cropped` false draws it turned and flipped only, for the crop box to sit on */
export function drawEdited(
	image: CanvasImageSource & { naturalWidth: number; naturalHeight: number },
	edits: ImageEdits,
	cropped: boolean
): HTMLCanvasElement {
	const w0 = image.naturalWidth;
	const h0 = image.naturalHeight;
	const o = orientedSize(edits, w0, h0);
	const crop = cropped ? edits.crop : UNCROPPED;
	const out = cropped ? editedSize(edits, w0, h0) : o;
	const canvas = document.createElement('canvas');
	canvas.width = out.w;
	canvas.height = out.h;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingQuality = 'high';
	const k = out.w / Math.max(1, Math.round(o.w * (1 - crop.l - crop.r)));
	ctx.scale(k, k);
	ctx.translate(-o.w * crop.l + o.w / 2, -o.h * crop.t + o.h / 2);
	ctx.transform(...edits.orientation, 0, 0);
	ctx.drawImage(image, -w0 / 2, -h0 / 2);
	return canvas;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		// the file protocol answers cross-origin, and without this the canvas could not be saved
		image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(m.image_read_failed()));
		image.src = url;
	});
}
