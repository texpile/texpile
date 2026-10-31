import type { FigureColors } from '$lib/draw/editor/figure/figureLanguage';

// Typst's named colors and how they look, for the swatches; the source only ever holds the names
const PALETTE: [string, string][] = [
	['black', '#000000'],
	['gray', '#aaaaaa'],
	['red', '#ff4136'],
	['orange', '#ff851b'],
	['green', '#2ecc40'],
	['teal', '#39cccc'],
	['blue', '#0074d9'],
	['purple', '#b10dc9'],
	['maroon', '#85144b']
];

const SHADES = ['100', '60', '30'] as const;

/** `red.lighten(40%)` as base and shade (60); anything fancier has no swatch */
function splitColor(color: string | null): { base: string | null; shade: string } {
	if (!color) return { base: null, shade: '100' };
	const m = color.match(/^([a-z]+)(?:\.lighten\((\d+)%\))?$/);
	return m ? { base: m[1], shade: m[2] ? String(100 - Number(m[2])) : '100' } : { base: color, shade: '100' };
}

function joinColor(base: string, shade: string) {
	return shade === '100' ? base : `${base}.lighten(${100 - Number(shade)}%)`;
}

function swatchFill(hex: string, shade: string) {
	const t = Number(shade) / 100;
	const c = [1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * t + 255 * (1 - t)));
	return `rgb(${c.join(' ')})`;
}

export const CETZ_COLORS: FigureColors = { swatches: PALETTE, shades: SHADES, split: splitColor, join: joinColor, swatchFill };
