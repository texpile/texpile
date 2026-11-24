// a font's ascent and descent for line boxes and the caret, per canvas font string, shared per window
import { canvasSupport, type CanvasSupport } from '../../engine/canvasSupport';
import { fontSizeOf } from './fontStrings';
import { measuringContext } from './textMeasure';

export type FontMetrics = {
	readonly ascent: number;
	readonly descent: number;
	/** canvas reports no underline metrics: Chromium's own fallback for a font without them */
	readonly underlineOffset: number;
	readonly underlineThickness: number;
};

type MetricsContext = {
	font: string;
	measureText(
		text: string
	): Pick<TextMetrics, 'fontBoundingBoxAscent' | 'fontBoundingBoxDescent' | 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent'>;
};

export type FontMetricsReader = (font: string) => FontMetrics;
/** forget: a face finished loading, so what was read from its fallback goes */
export type KeptFontMetrics = FontMetricsReader & { forget(families: readonly string[]): void };

export function createFontMetrics(
	support: CanvasSupport = canvasSupport(),
	makeContext: () => MetricsContext = () => measuringContext(support)
): KeptFontMetrics {
	const context = makeContext();
	const known = new Map<string, FontMetrics>();
	function read(font: string): FontMetrics {
		let metrics = known.get(font);
		if (!metrics) {
			context.font = font;
			const sample = context.measureText('Hg');
			const ascent = support.fontBoundingBox ? sample.fontBoundingBoxAscent : sample.actualBoundingBoxAscent;
			const descent = support.fontBoundingBox ? sample.fontBoundingBoxDescent : sample.actualBoundingBoxDescent;
			const thickness = Math.max(1, fontSizeOf(font) / 16);
			metrics = { ascent, descent, underlineOffset: Math.max(1, descent / 2), underlineThickness: thickness };
			known.set(font, metrics);
		}
		return metrics;
	}
	return Object.assign(read, {
		forget(families: readonly string[]): void {
			for (const font of known.keys()) if (families.some((family) => font.includes(family))) known.delete(font);
		}
	});
}

const windows = new WeakMap<Window, KeptFontMetrics>();

export function windowFontMetrics(win: Window & typeof globalThis = window): KeptFontMetrics {
	let reader = windows.get(win);
	if (!reader) windows.set(win, (reader = createFontMetrics(canvasSupport(win), () => measuringContext(canvasSupport(win), win.document))));
	return reader;
}
