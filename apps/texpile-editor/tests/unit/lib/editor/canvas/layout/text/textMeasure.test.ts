import { describe, expect, it } from 'vitest';
import type { CanvasSupport } from '$lib/editor/canvas/engine/canvasSupport';
import { createTextMeasure, type MeasuringContext } from '$lib/editor/canvas/layout/text/textMeasure';
import { ZWNJ } from '$lib/editor/canvas/layout/text/ligatures';

const FULL: CanvasSupport = {
	editContext: false,
	letterSpacing: true,
	wordSpacing: true,
	fontVariantCaps: true,
	fontKerning: true,
	fontStretch: true,
	fontBoundingBox: true,
	segmenter: true,
	offscreenCanvas: false,
	bitmapResize: false,
	idleCallback: false,
	fontVariantNumeric: false
};

function recordingContext(): MeasuringContext & { measured: string[] } {
	const measured: string[] = [];
	return {
		font: '',
		letterSpacing: '0px',
		measured,
		measureText(text: string) {
			measured.push(text);
			// 10 px a character plus the context's letter spacing after each, as the canvas adds it; a ZWNJ is nothing
			return { width: [...text.replaceAll(ZWNJ, '')].length * (10 + parseFloat(this.letterSpacing ?? '0')) };
		}
	};
}

describe('createTextMeasure', () => {
	it('turns ligatures off with a hair of letter spacing and takes the hair back out of the width', () => {
		const context = recordingContext();
		const measure = createTextMeasure(FULL, () => context);
		expect(parseFloat(context.letterSpacing!)).toBeCloseTo(1 / 60, 9);
		expect(measure('16px serif', 'office')).toBeCloseTo(60, 9);
		measure('16px serif', 'office');
		expect(context.measured.filter((text) => text === 'office')).toHaveLength(1);
	});

	it('takes the hair back out once per gap where the engine spaces between letters only', () => {
		const context = recordingContext();
		const between = {
			...context,
			measureText(text: string) {
				const characters = [...text.replaceAll(ZWNJ, '')].length;
				return { width: characters * 10 + Math.max(0, characters - 1) * parseFloat(this.letterSpacing ?? '0') };
			}
		};
		expect(createTextMeasure(FULL, () => between)('16px serif', 'office')).toBeCloseTo(60, 9);
	});

	it('breaks Latin ligature pairs with a ZWNJ where the canvas has no letter spacing', () => {
		const context = recordingContext();
		const measure = createTextMeasure({ ...FULL, letterSpacing: false }, () => context);
		measure('16px serif', 'office fit');
		expect(context.measured).toEqual([`of${ZWNJ}f${ZWNJ}ice f${ZWNJ}it`]);
		expect(measure.ligatureBreak).toBe('zwnj');
	});

	it('falls back to ZWNJs where a font keeps its ligatures under the hair, as Gecko and WebKit canvases do', () => {
		const context = recordingContext();
		const ligated = {
			...context,
			measureText(text: string) {
				// a font that joins fi and fl into one glyph whatever the spacing
				return context.measureText.call(this, text.replace(/f[il]/g, 'f'));
			}
		};
		const measure = createTextMeasure(FULL, () => ligated);
		expect(measure.ligatureBreak).toBe('zwnj');
		expect(measure('16px serif', 'fit')).toBe(30);
	});
});
