// Renders a PDF's first page to a blob URL an <img> can display: \includegraphics{fig.pdf} is
// the dominant figure format in papers, and the image node view is <img>-based, so PDF figures
// showed the not-found placeholder even when the file existed. Uses the pdf pane's shared
// worker; each document is destroyed after its one render, which the singleton's non-adopting
// getPdfDocument makes safe. Rendered once per URL for the session - the blob is a snapshot,
// a regenerated figure shows after the file is reopened.
import { getPdfDocument } from '$lib/pdf-view';
import { figureRasterScale } from './pdfRasterScale';

const cache = new Map<string, Promise<string | null>>();

/** blob URL of the PDF's first page, or null when it cannot be loaded or rendered. */
export function pdfPageImageUrl(url: string): Promise<string | null> {
	let hit = cache.get(url);
	if (!hit) {
		hit = render(url).catch(() => {
			cache.delete(url); // a failed render can be transient (file mid-write): allow a retry
			return null;
		});
		cache.set(url, hit);
	}
	return hit;
}

async function render(url: string): Promise<string | null> {
	const task = await getPdfDocument(url);
	if (!task) return null;
	const doc = await task.promise;
	try {
		const page = await doc.getPage(1);
		const base = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: figureRasterScale(base.width, base.height) });
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		// print intent: the display intent chunks its work through requestAnimationFrame, which a
		// hidden or minimized window never fires - the render just hangs there. this is a one-shot
		// offscreen rasterization, progressive display buys nothing.
		await page.render({ canvasContext: ctx, viewport, canvas, intent: 'print' }).promise;
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		return blob ? URL.createObjectURL(blob) : null;
	} finally {
		void task.destroy();
	}
}
