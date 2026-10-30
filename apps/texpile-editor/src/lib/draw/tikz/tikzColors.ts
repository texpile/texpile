import type { FigureColors } from '$lib/draw/editor/figure/figureLanguage';

// xcolor's names and how they look, for the swatches; the source only ever holds the names
const PALETTE: [string, string][] = [
	['black', '#000000'],
	['gray', '#808080'],
	['red', '#ff0000'],
	['orange', '#ff8000'],
	['green', '#00ff00'],
	['teal', '#008080'],
	['blue', '#0000ff'],
	['violet', '#800080'],
	['brown', '#bf8040']
];

const SHADES = ['100', '60', '30'] as const;

export const TIKZ_COLORS: FigureColors = { swatches: PALETTE, shades: SHADES, split: splitColor, join: joinColor, swatchFill };

/** `red!60` as base and shade; anything fancier has no swatch */
function splitColor(color: string | null): { base: string | null; shade: string } {
	if (!color) return { base: null, shade: '100' };
	const m = color.match(/^([a-z]+)(?:!(\d+))?$/i);
	return m ? { base: m[1], shade: m[2] ?? '100' } : { base: color, shade: '100' };
}

function joinColor(base: string, shade: string) {
	return shade === '100' ? base : `${base}!${shade}`;
}

/** what a swatch shows: the color mixed with white the way xcolor's `!` does */
function swatchFill(hex: string, shade: string) {
	const t = Number(shade) / 100;
	const c = [1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * t + 255 * (1 - t)));
	return `rgb(${c.join(' ')})`;
}
