// ligatures off (D31), as prosemirror.css has them in the DOM: a hair of letter spacing where it breaks them (Chromium),
// else a zero width non-joiner between the Latin pairs fonts join (Gecko and WebKit canvases keep ligatures under any
// letter spacing; the ZWNJ widths equal their DOM's with font-variant-ligatures: none, measured in styleSnapshot.spec)
/** the least spacing Gecko keeps (one app unit, 1/60 px); any non-zero letter spacing turns optional ligatures off */
export const LIGATURE_BREAK_PX = 1 / 60;
export const ZWNJ = '‌';

const PAIRS = /f(?=[fijlt])/g;
const SAMPLE = 'xxxxxxxx';
const LIGATURE_SAMPLE = 'office fifl';
/** generic families whose faces carry f ligatures on every desktop */
const LIGATURE_FONTS = ['40px serif', '40px sans-serif', '40px system-ui'];

/** what the hair adds per character, and whether the engine adds it after the last one too (WebKit does not) */
export type LigatureBreak = { readonly perCharacter: number; readonly afterLast: boolean };

type SpacingContext = { font?: string; letterSpacing?: string; measureText(text: string): { width: number } };

/** the text with a ZWNJ after every f that a font could join to the next letter */
export function withoutLigatures(text: string): string {
	return text.includes('f') ? text.replace(PAIRS, `f${ZWNJ}`) : text;
}

/** the letter spacing a context draws a run with: the run's own plus the hair, as a CSS length */
export function letterSpacingWithBreak(letterSpacing: number): string {
	return `${letterSpacing + LIGATURE_BREAK_PX}px`;
}

/** measures what the hair adds on this engine and leaves it set; null when the engine ignores it */
export function calibrateLigatureBreak(context: SpacingContext): LigatureBreak | null {
	function widthWith(spacing: string): number {
		// eslint-disable-next-line no-param-reassign -- the context is the one the measurer owns
		context.letterSpacing = spacing;
		return context.measureText(SAMPLE).width;
	}
	const plain = widthWith('0px');
	const perPixel = Math.round(widthWith('1px') - plain);
	const added = widthWith(letterSpacingWithBreak(0)) - plain;
	if (added <= 0 || perPixel < SAMPLE.length - 1) return null;
	return { perCharacter: added / perPixel, afterLast: perPixel === SAMPLE.length };
}

/** the spacing the hair added to a measured run of `characters` */
export function breakWidth(hair: LigatureBreak, characters: number): number {
	return hair.perCharacter * (hair.afterLast ? characters : Math.max(0, characters - 1));
}

/** false when a font kept its ligatures under the hair: the engine needs the ZWNJs; leaves the hair set */
export function hairBreaksLigatures(context: SpacingContext, hair: LigatureBreak): boolean {
	const spaced = letterSpacingWithBreak(0);
	try {
		for (const font of LIGATURE_FONTS) {
			// eslint-disable-next-line no-param-reassign -- the context is the one the measurer owns
			context.font = font;
			// eslint-disable-next-line no-param-reassign -- as above
			context.letterSpacing = spaced;
			const withHair = context.measureText(LIGATURE_SAMPLE).width - breakWidth(hair, [...LIGATURE_SAMPLE].length);
			// eslint-disable-next-line no-param-reassign -- as above
			context.letterSpacing = '0px';
			if (Math.abs(context.measureText(withoutLigatures(LIGATURE_SAMPLE)).width - withHair) > 0.01) return false;
		}
		return true;
	} finally {
		// eslint-disable-next-line no-param-reassign -- as above
		context.letterSpacing = spaced;
	}
}
