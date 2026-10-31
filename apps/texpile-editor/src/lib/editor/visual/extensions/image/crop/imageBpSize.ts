// an image's size as graphicx reads it, in bp: pixels at the resolution the file names, else 72 dpi
import { namedResolution } from '$lib/images/edit/imageResolution';
import { pdfPageSize } from '../pdfImageSource';

export function resolutionOf(bytes: Uint8Array): { x: number; y: number } {
	const found = namedResolution(bytes);
	return found && found.x > 0 && found.y > 0 ? found : { x: 72, y: 72 };
}

export async function imageBpSize(url: string, pixels: { w: number; h: number }): Promise<{ w: number; h: number }> {
	const page = pdfPageSize(url);
	if (page) return page;
	const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
	const dpi = resolutionOf(bytes);
	return { w: (pixels.w * 72) / dpi.x, h: (pixels.h * 72) / dpi.y };
}
