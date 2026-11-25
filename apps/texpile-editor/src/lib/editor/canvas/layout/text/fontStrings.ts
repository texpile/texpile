// one canvas font string per FontSpec, the form wordWidths.ts measured with, so font fallback stays the browser's
import type { FontSpec } from '../../contracts/styleTypes';

const known = new WeakMap<FontSpec, string>();

/**
 * style, small caps, weight, stretch, size and the computed family list; small caps ride in the shorthand, which every
 * engine's canvas parses, and all-small-caps goes through fontVariantCaps where the context has it
 */
export function canvasFontOf(font: FontSpec): string {
	let text = known.get(font);
	if (text === undefined) {
		const caps = font.caps === 'normal' ? '' : 'small-caps ';
		const stretch = font.stretch === 'normal' ? '' : `${font.stretch} `;
		text = `${font.style} ${caps}${font.weight} ${stretch}${font.sizePx}px ${font.families}`;
		known.set(font, text);
	}
	return text;
}

/** the px size a canvas font string names */
export function fontSizeOf(font: string): number {
	return Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
}
