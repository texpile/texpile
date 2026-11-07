import { getPdfDocument } from '$lib/pdf-view';
import { clampRegion, compiledPictureKey, type PageRegion } from './pictureRegion';

export type PictureCrop = { url: string; width: number; height: number };

// css px per bp
const CSS_PER_BP = 96 / 72;
const KEPT = 80;

type OpenPdf = { url: string; task: ReturnType<typeof getPdfDocument> };

const crops = new Map<string, Promise<PictureCrop | null>>();
const users = new Map<OpenPdf, number>();
let current: OpenPdf | null = null;

// one document serves the crops of a compile; it is destroyed once the next compile's has taken over
async function destroy(pdf: OpenPdf): Promise<void> {
	void (await pdf.task.catch(() => null))?.destroy();
}

function acquire(url: string): OpenPdf {
	if (current?.url !== url) {
		const old = current;
		current = { url, task: getPdfDocument(url) };
		if (old && !users.get(old)) void destroy(old);
	}
	users.set(current, (users.get(current) ?? 0) + 1);
	return current;
}

function release(pdf: OpenPdf): void {
	const left = (users.get(pdf) ?? 1) - 1;
	users.set(pdf, left);
	if (left === 0 && pdf !== current) {
		users.delete(pdf);
		void destroy(pdf);
	}
}

function forget(): void {
	while (crops.size > KEPT) {
		const [oldest] = crops.keys();
		const gone = crops.get(oldest);
		crops.delete(oldest);
		void gone?.then((c) => c && URL.revokeObjectURL(c.url));
	}
}

async function draw(pdfUrl: string, region: PageRegion, scale: number): Promise<PictureCrop | null> {
	const pdf = acquire(pdfUrl);
	try {
		const task = await pdf.task;
		if (!task) return null;
		const page = await (await task.promise).getPage(region.page);
		const base = page.getViewport({ scale: 1 });
		const box = clampRegion(region, base.width, base.height);
		if (!box) return null;
		const viewport = page.getViewport({ scale, offsetX: -box.x * scale, offsetY: -box.y * scale });
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(box.w * scale);
		canvas.height = Math.ceil(box.h * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		// print intent: the display intent waits on requestAnimationFrame, which a hidden window never fires
		await page.render({ canvasContext: ctx, viewport, canvas, intent: 'print' }).promise;
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		if (!blob) return null;
		return { url: URL.createObjectURL(blob), width: box.w * CSS_PER_BP, height: box.h * CSS_PER_BP };
	} finally {
		void release(pdf);
	}
}

export function renderPictureCrop(pdfPath: string, pdfUrl: string, mtimeMs: number, region: PageRegion): Promise<PictureCrop | null> {
	const scale = CSS_PER_BP * (window.devicePixelRatio || 1);
	const key = compiledPictureKey(pdfPath, mtimeMs, region, scale);
	let hit = crops.get(key);
	if (!hit) {
		hit = draw(pdfUrl, region, scale).catch(() => {
			crops.delete(key);
			return null;
		});
		crops.set(key, hit);
		forget();
	}
	return hit;
}
