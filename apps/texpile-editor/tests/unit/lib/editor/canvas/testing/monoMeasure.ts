// the fixed-advance measurer unit tests lay out with (18.1): 0.6 em per character, 1 em per CJK character
import type { ReplacedContent, TextMeasure } from '$lib/editor/canvas';

export const MONO_EM = 0.6;
export const CJK_EM = 1;

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}]/u;

/** the px size a canvas font string names, 16 when it names none */
export function fontSizeOf(font: string): number {
	return Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
}

export const monoMeasure: TextMeasure = (font, text) => {
	let ems = 0;
	for (const char of text) ems += CJK.test(char) ? CJK_EM : MONO_EM;
	return ems * fontSizeOf(font);
};

/** an atom at its face's fixed size, in CSS px; it paints nothing */
export function fixedReplaced(size: { width: number; height: number; baseline?: number }): ReplacedContent {
	return { intrinsic: () => size, paint: () => {} };
}
