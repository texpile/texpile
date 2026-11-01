// an image's size as graphicx reads it, in bp: pixels at the resolution the file names, else 72 dpi
import { exifOrientation } from '$lib/images/crop/exifOrientation';
import { namedResolution } from '$lib/images/edit/imageResolution';
import { pdfPageSize } from '../pdfImageSource';
import type { ImageSize } from './imageCropFormat';

export function resolutionOf(bytes: Uint8Array): { x: number; y: number } {
	const found = namedResolution(bytes);
	return found && found.x > 0 && found.y > 0 ? found : { x: 72, y: 72 };
}

/** `pixels` as the browser shows the image; TeX reads the file's own, which an EXIF quarter turn swaps */
export async function imageBpSize(url: string, pixels: { w: number; h: number }): Promise<ImageSize> {
	const page = pdfPageSize(url);
	if (page) return page;
	const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
	const dpi = resolutionOf(bytes);
	const orientation = exifOrientation(bytes);
	const stored = orientation > 4 ? { w: pixels.h, h: pixels.w } : pixels;
	return { w: (stored.w * 72) / dpi.x, h: (stored.h * 72) / dpi.y, orientation };
}
