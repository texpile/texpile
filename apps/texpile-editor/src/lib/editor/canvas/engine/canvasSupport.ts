// the canvas features each engine has, tested once per window; every module that falls back takes the table as input
export type CanvasSupport = {
	readonly editContext: boolean;
	readonly letterSpacing: boolean;
	readonly wordSpacing: boolean;
	readonly fontVariantCaps: boolean;
	readonly fontKerning: boolean;
	readonly fontStretch: boolean;
	readonly fontBoundingBox: boolean;
	readonly segmenter: boolean;
	readonly offscreenCanvas: boolean;
	/** createImageBitmap honors resizeWidth; probeBitmapResize settles it, true until then where the function exists */
	bitmapResize: boolean;
	readonly idleCallback: boolean;
	/** no engine has it: tabular figures are drawn per digit at the widest digit's advance */
	readonly fontVariantNumeric: boolean;
};

const detected = new WeakMap<Window, CanvasSupport>();

function hasOffscreen2d(win: Window & typeof globalThis): boolean {
	if (typeof win.OffscreenCanvas !== 'function') return false;
	try {
		return !!new win.OffscreenCanvas(1, 1).getContext('2d');
	} catch {
		return false;
	}
}

export function detectCanvasSupport(win: Window & typeof globalThis): CanvasSupport {
	const context = win.CanvasRenderingContext2D?.prototype ?? {};
	const metrics = win.TextMetrics?.prototype ?? {};
	return {
		editContext: 'EditContext' in win,
		letterSpacing: 'letterSpacing' in context,
		wordSpacing: 'wordSpacing' in context,
		fontVariantCaps: 'fontVariantCaps' in context,
		fontKerning: 'fontKerning' in context,
		fontStretch: 'fontStretch' in context,
		fontBoundingBox: 'fontBoundingBoxAscent' in metrics,
		segmenter: typeof Intl !== 'undefined' && 'Segmenter' in Intl,
		offscreenCanvas: hasOffscreen2d(win),
		bitmapResize: typeof win.createImageBitmap === 'function',
		idleCallback: typeof win.requestIdleCallback === 'function',
		fontVariantNumeric: 'fontVariantNumeric' in context
	};
}

/** this window's table, tested on first use */
export function canvasSupport(win: Window & typeof globalThis = window): CanvasSupport {
	let support = detected.get(win);
	if (!support) detected.set(win, (support = detectCanvasSupport(win)));
	return support;
}

/** Safari before 17 takes createImageBitmap's options and ignores the resize */
export async function probeBitmapResize(win: Window & typeof globalThis = window): Promise<boolean> {
	const support = canvasSupport(win);
	if (!support.bitmapResize) return false;
	try {
		const bitmap = await win.createImageBitmap(new win.ImageData(2, 2), { resizeWidth: 1, resizeHeight: 1 });
		support.bitmapResize = bitmap.width === 1;
		bitmap.close();
	} catch {
		support.bitmapResize = false;
	}
	return support.bitmapResize;
}
