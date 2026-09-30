import { box } from '$lib/runes/box.svelte';
import { m } from '$lib/paraglide/messages';

/** how the previews draw the document: its own colors, or as a reader with a color vision deficiency sees them */
export type ColorVisionMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

type Dichromacy = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const COLOR_VISION_MODES: readonly ColorVisionMode[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

// Machado, Oliveira and Fernandes (2009), "A Physiologically-based Model for Simulation of Color
// Vision Deficiency", IEEE TVCG 15(6), at severity 1.0. The model is defined on LINEAR rgb, which is
// the space an SVG filter works in by default (color-interpolation-filters: linearRGB).
const MACHADO_2009: Record<Dichromacy, readonly number[]> = {
	protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
	deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
	tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]
};

// achromatopsia sees brightness alone: relative luminance, ITU-R BT.709 weights on linear rgb
const LUMINANCE = [0.2126, 0.7152, 0.0722];

/** the preview-wide choice. Per window and per session on purpose: it is a check someone runs, and
 *  a document that opened gray the next morning would read as broken, not as a setting */
export const colorVision = box<ColorVisionMode>('none');

/** the 3x3 linear-rgb matrix, row-major, or null when the document keeps its own colors */
export function colorVisionMatrix(mode: ColorVisionMode): readonly number[] | null {
	if (mode === 'none') return null;
	if (mode === 'achromatopsia') return [...LUMINANCE, ...LUMINANCE, ...LUMINANCE];
	return MACHADO_2009[mode];
}

/** the `values` of an feColorMatrix (4x5, alpha passed through), or null for no filter at all */
export function feColorMatrixValues(mode: ColorVisionMode): string | null {
	const matrix = colorVisionMatrix(mode);
	if (!matrix) return null;
	const rows = [0, 1, 2].map((r) => [...matrix.slice(r * 3, r * 3 + 3), 0, 0].join(' '));
	return [...rows, '0 0 0 1 0'].join('  ');
}

/** a menu value or a stored string back to a mode; null for anything that is not one */
export function parseColorVisionMode(value: unknown): ColorVisionMode | null {
	return COLOR_VISION_MODES.find((mode) => mode === value) ?? null;
}

export function colorVisionLabel(mode: ColorVisionMode): string {
	switch (mode) {
		case 'protanopia':
			return m.color_vision_protanopia();
		case 'deuteranopia':
			return m.color_vision_deuteranopia();
		case 'tritanopia':
			return m.color_vision_tritanopia();
		case 'achromatopsia':
			return m.color_vision_achromatopsia();
		default:
			return m.color_vision_none();
	}
}
