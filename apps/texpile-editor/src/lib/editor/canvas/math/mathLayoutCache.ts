// formula layouts in em, per window (D34): sized and painted at any font size or zoom without laying out again
import { layoutLatex, layoutTypst, type MathLayout } from 'mathlive';
import { mathMacros, mathMacrosKey } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { themeColorMap } from '$lib/editor/visual/extensions/mathlivebridge/themeBlack';
import type { MathSource } from '../contracts/faceTypes';
import type { TextMeasure } from '../contracts/layoutTypes';
import { windowTextMeasure } from '../layout/text/textMeasure';

/** dictionaries of macros kept, the one unused longest going first */
const KEPT_DICTIONARIES = 3;
const KEPT_FORMULAS = 4000;
const MEASURE_PX = 100;

/** the formula's text where MathLive cannot read it, in the face's own font */
export const SOURCE_FONT = '400 1em inherit';

export type FormulaLayouts = {
	/** the layout, made now when not kept; family: the font around the formula, which its text takes */
	layout(source: MathSource, family: string): MathLayout;
	/** the macros dictionary a LaTeX formula reads, so a block holding one is built again when it changes */
	keyOf(source: MathSource): string;
	/** an edited display's sideways scroll, px (E8) */
	scrollX?(): number;
};

function sourceLayout(text: string, family: string, measure: TextMeasure): MathLayout {
	const width = measure(`400 ${MEASURE_PX}px ${family}`, text) / MEASURE_PX;
	return {
		width,
		ascent: 0.8,
		descent: 0.2,
		items: [{ kind: 'glyphs', x: 0, y: 0, text, font: SOURCE_FONT, color: 'current', opacity: 1 }],
		atoms: new Map(),
		selection: [],
		macroCalls: [],
		rows: []
	};
}

const fonts = new Map<string, string>();

/** MathLive spells the font out for every glyph: kept layouts share one string per font (a third of their heap) */
function shareFonts(layout: MathLayout): MathLayout {
	for (const item of layout.items) {
		if (item.kind !== 'glyphs') continue;
		const font = fonts.get(item.font);
		if (font === undefined) fonts.set(item.font, item.font);
		else item.font = font;
	}
	return layout;
}

export class FormulaLayoutCache implements FormulaLayouts {
	private readonly kept = new Map<string, Map<string, MathLayout>>();

	constructor(private readonly measure: TextMeasure) {}

	/** a face finished loading: the \text and placeholder widths measured with its fallback go */
	forget(): void {
		this.kept.clear();
	}

	keyOf(source: MathSource): string {
		return source.syntax === 'typst' ? '' : mathMacrosKey();
	}

	layout(source: MathSource, family: string): MathLayout {
		const store = this.store(this.keyOf(source));
		const key = `${source.syntax}\0${source.display}\0${family}\0${source.source}`;
		let layout = store.get(key);
		if (!layout) {
			layout = shareFonts(this.make(source, family));
			if (store.size >= KEPT_FORMULAS) store.delete(store.keys().next().value!);
			store.set(key, layout);
		}
		return layout;
	}

	private store(macros: string): Map<string, MathLayout> {
		let store = this.kept.get(macros);
		if (store) this.kept.delete(macros);
		else store = new Map();
		this.kept.set(macros, store);
		if (this.kept.size > KEPT_DICTIONARIES) this.kept.delete(this.kept.keys().next().value!);
		return store;
	}

	private make(source: MathSource, family: string): MathLayout {
		// inline formulas in text style, displays in display style (A11)
		const defaultMode = source.display ? ('math' as const) : ('inline-math' as const);
		const options = { measure: this.measure, family, colorMap: themeColorMap, defaultMode };
		try {
			const layout =
				source.syntax === 'typst'
					? layoutTypst(source.source, options)
					: layoutLatex(source.source, { ...options, macros: mathMacros.current });
			return layout ?? sourceLayout(source.source, family, this.measure);
		} catch {
			// MathLive throws outright on some malformed input; the source stands in for the formula
			return sourceLayout(source.source, family, this.measure);
		}
	}
}

const windows = new WeakMap<Window, FormulaLayoutCache>();

export function windowFormulaLayouts(win: Window & typeof globalThis = window): FormulaLayoutCache {
	let cache = windows.get(win);
	if (!cache) windows.set(win, (cache = new FormulaLayoutCache(windowTextMeasure(win))));
	return cache;
}
