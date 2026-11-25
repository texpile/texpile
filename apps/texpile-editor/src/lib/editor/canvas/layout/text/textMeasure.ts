// text widths per canvas font with ligatures off, cached per window: whole words and runs, never single characters,
// with the context settings wordWidths.ts used, so held line ends match the DOM editor's
import type { TextMeasure } from '../../contracts/layoutTypes';
import { canvasSupport, type CanvasSupport } from '../../engine/canvasSupport';
import { graphemeCount } from './graphemes';
import { breakWidth, calibrateLigatureBreak, hairBreaksLigatures, withoutLigatures } from './ligatures';

const MOST_PER_FONT = 50000;

/** the context members measuring touches, so a test can count calls */
export type MeasuringContext = {
	font: string;
	letterSpacing?: string;
	fontKerning?: CanvasFontKerning;
	measureText(text: string): { width: number };
};

export type WindowTextMeasure = TextMeasure & {
	/** how ligatures are kept apart in this engine: the painter draws with the same */
	readonly ligatureBreak: 'hair' | 'zwnj';
	/** a face finished loading: drop the widths of every font naming one of the families */
	forget(families?: readonly string[]): void;
};

/** an OffscreenCanvas context where the engine has one, else a detached canvas's */
export function measuringContext(
	support: CanvasSupport,
	doc: Document = document
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
	if (support.offscreenCanvas) return new OffscreenCanvas(1, 1).getContext('2d')!;
	return doc.createElement('canvas').getContext('2d')!;
}

export function createTextMeasure(
	support: CanvasSupport = canvasSupport(),
	makeContext: () => MeasuringContext = () => measuringContext(support)
): WindowTextMeasure {
	const context = makeContext();
	const widths = new Map<string, Map<string, number>>();
	let applied = '';
	if (support.fontKerning) context.fontKerning = 'normal';
	const calibrated = support.letterSpacing ? calibrateLigatureBreak(context) : null;
	const hair = calibrated && hairBreaksLigatures(context, calibrated) ? calibrated : null;
	if (!hair && support.letterSpacing) context.letterSpacing = '0px';

	function measure(font: string, text: string): number {
		let known = widths.get(font);
		if (!known) widths.set(font, (known = new Map()));
		let width = known.get(text);
		if (width === undefined) {
			if (known.size >= MOST_PER_FONT) known.clear();
			if (applied !== font) context.font = applied = font;
			width = hair
				? context.measureText(text).width - breakWidth(hair, graphemeCount(text))
				: context.measureText(withoutLigatures(text)).width;
			known.set(text, width);
		}
		return width;
	}

	return Object.assign(measure, {
		ligatureBreak: hair ? ('hair' as const) : ('zwnj' as const),
		forget(families?: readonly string[]): void {
			if (!families) widths.clear();
			else for (const font of widths.keys()) if (families.some((family) => font.includes(family))) widths.delete(font);
			applied = '';
		}
	});
}

const windows = new WeakMap<Window, WindowTextMeasure>();

/** the measurer every canvas view of this window shares (D34) */
export function windowTextMeasure(win: Window & typeof globalThis = window): WindowTextMeasure {
	let measure = windows.get(win);
	if (!measure)
		windows.set(win, (measure = createTextMeasure(canvasSupport(win), () => measuringContext(canvasSupport(win), win.document))));
	return measure;
}
