import type { Rgba, ThemeToken, ThemeTokenText } from '../../contracts/styleTypes';
import { parseColor, sameColor, TRANSPARENT } from '../resolve/colorValue';
import {
	COLOR_TOKENS,
	FONT_TOKENS,
	LENGTH_TOKENS,
	TEXT_TOKENS,
	type ColorToken,
	type FontToken,
	type LengthToken,
	type TextToken
} from './tokenList';
import { resolveLightDark, resolveRelativeColors } from './tokenText';

/** what a read changed: colors repaint, lengths, fonts and text values lay out again */
export type TokenChange = { readonly paint: boolean; readonly layout: boolean };

type TokenValues = {
	/** each token's declared text: light-dark() and relative colors resolved, currentColor kept */
	readonly declared: ReadonlyMap<string, string>;
	readonly textColor: Rgba;
	readonly lengths: ReadonlyMap<LengthToken, number>;
	readonly fonts: ReadonlyMap<FontToken, string>;
	readonly texts: ReadonlyMap<TextToken, string>;
	readonly remPx: number;
	/** the editor text font setting, unset: null */
	readonly editorFont: string | null;
	readonly dark: boolean;
};

const SCALE = 1000;
const PROBE_STYLE = 'position:absolute;visibility:hidden;pointer-events:none;contain:strict;';

function sameValues<K, V>(one: ReadonlyMap<K, V>, two: ReadonlyMap<K, V>, same: (a: V, b: V) => boolean): boolean {
	for (const [name, value] of one) {
		const other = two.get(name);
		if (other === undefined || !same(value, other)) return false;
	}
	return true;
}

/** the editor's custom properties, read in one batch under the view's root so glass and custom theme overrides apply */
export class ThemeTokens {
	/** probe reads so far (frameStats().styleReads) and the ms they took */
	reads = 0;
	readMs = 0;
	private values: TokenValues | null = null;

	constructor(private readonly root: HTMLElement) {}

	/** one probe with a child per token and one style recalculation; the probe is gone when it returns */
	read(): TokenChange {
		const start = performance.now();
		try {
			return this.probe();
		} finally {
			this.readMs += performance.now() - start;
		}
	}

	private probe(): TokenChange {
		const doc = this.root.ownerDocument;
		const view = doc.defaultView!;
		const probe = doc.createElement('div');
		probe.setAttribute('style', PROBE_STYLE);
		function child(property: string, value: string): HTMLElement {
			const el = doc.createElement('span');
			el.style.display = 'block';
			el.style.setProperty(property, value);
			probe.appendChild(el);
			return el;
		}
		const schemeEl = doc.createElement('span');
		schemeEl.style.color = 'light-dark(rgb(0 0 0), rgb(255 255 255))';
		probe.appendChild(schemeEl);
		// widths snap to 1/64 px, so each value is read a thousand times over
		const lengthEls = LENGTH_TOKENS.map((name) => child('width', `calc(var(${name}) * ${SCALE})`));
		const textEls = TEXT_TOKENS.map((name) => child('width', `calc(var(${name}) * ${SCALE}px)`));
		const fontEls = FONT_TOKENS.map((name) => child('font-family', `var(${name})`));
		const remEl = child('width', `${SCALE}rem`);
		function widthOf(el: HTMLElement): number {
			return parseFloat(view.getComputedStyle(el).width) / SCALE;
		}
		this.root.appendChild(probe);
		this.reads++;
		try {
			const dark = view.getComputedStyle(schemeEl).color === 'rgb(255, 255, 255)';
			const styles = view.getComputedStyle(probe);
			const declared = new Map<string, string>();
			for (const name of [...COLOR_TOKENS, ...LENGTH_TOKENS, ...FONT_TOKENS, ...TEXT_TOKENS]) {
				declared.set(name, resolveRelativeColors(resolveLightDark(styles.getPropertyValue(name).trim(), dark)));
			}
			const textColor = parseColor(styles.color) ?? TRANSPARENT;
			const lengths = new Map<LengthToken, number>();
			LENGTH_TOKENS.forEach((name, i) => lengths.set(name, widthOf(lengthEls[i]) || 0));
			const fonts = new Map<FontToken, string>();
			FONT_TOKENS.forEach((name, i) => fonts.set(name, view.getComputedStyle(fontEls[i]).fontFamily));
			const texts = new Map<TextToken, string>();
			TEXT_TOKENS.forEach((name, i) => {
				const factor = widthOf(textEls[i]);
				texts.set(name, Number.isFinite(factor) ? String(factor) : declared.get(name)!);
				declared.set(name, texts.get(name)!);
			});
			LENGTH_TOKENS.forEach((name) => declared.set(name, `${lengths.get(name)}px`));
			const remPx = widthOf(remEl) || 16;
			const editorFont = styles.getPropertyValue('--editor-text-font').trim() || null;
			return this.replace({ declared, textColor, lengths, fonts, texts, remPx, editorFont, dark });
		} finally {
			probe.remove();
		}
	}

	/** a color token against the root's text color, for the token that names currentColor */
	color(name: ColorToken): Rgba {
		const { declared, textColor } = this.current();
		return parseColor(declared.get(name)!, textColor) ?? TRANSPARENT;
	}

	/** the resolver's token source: null for a name off the list */
	readonly declaredText: ThemeTokenText = (name: ThemeToken) => this.current().declared.get(name) ?? null;

	/** px */
	length(name: LengthToken): number {
		return this.current().lengths.get(name)!;
	}

	font(name: FontToken): string {
		return this.current().fonts.get(name)!;
	}

	text(name: TextToken): string {
		return this.current().texts.get(name)!;
	}

	remPx(): number {
		return this.current().remPx;
	}

	editorFont(): string | null {
		return this.current().editorFont;
	}

	/** the color scheme the root resolves light-dark() in */
	dark(): boolean {
		return this.current().dark;
	}

	private current(): TokenValues {
		if (!this.values) this.read();
		return this.values!;
	}

	private replace(next: TokenValues): TokenChange {
		const old = this.values;
		this.values = next;
		if (!old) return { paint: true, layout: true };
		function same<V>(a: V, b: V): boolean {
			return a === b;
		}
		const paint =
			old.dark !== next.dark ||
			!sameColor(old.textColor, next.textColor) ||
			COLOR_TOKENS.some((name) => old.declared.get(name) !== next.declared.get(name));
		const layout = !(
			old.remPx === next.remPx &&
			old.editorFont === next.editorFont &&
			sameValues(old.lengths, next.lengths, same) &&
			sameValues(old.fonts, next.fonts, same) &&
			sameValues(old.texts, next.texts, same)
		);
		return { paint, layout };
	}
}

/** D17: the first opaque background up the editor root's ancestors; a translucent one (window glass) paints no ground */
export function groundOf(root: HTMLElement): Rgba | null {
	const view = root.ownerDocument.defaultView!;
	for (let at: HTMLElement | null = root.parentElement; at; at = at.parentElement) {
		const color = parseColor(view.getComputedStyle(at).backgroundColor);
		if (color && color.a > 0) return color.a >= 1 ? color : null;
	}
	return null;
}
