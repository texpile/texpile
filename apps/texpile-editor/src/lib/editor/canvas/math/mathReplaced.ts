// the replaced formula element (13.3): sized from its layout at the element's font size, its baseline the formula's
import type { MathSource, ReplacedContent, ThemeTokenColor } from '../contracts/faceTypes';
import type { ComputedStyle, ThemeToken } from '../contracts/styleTypes';
import { canvasFill } from '../style/resolve/colorValue';
import { windowFontMetrics } from '../layout/text/fontMetrics';
import { canvasFontOf } from '../layout/text/fontStrings';
import { faceElement, type FaceElement } from '../tree/faceElement';
import type { MathLayout } from 'mathlive';
import { windowFormulaLayouts, type FormulaLayouts } from './mathLayoutCache';
import { paintMathLayout, type MathRole } from './mathPaint';

// MathLive's own colors as theme tokens, so they follow the app's mode instead of the OS scheme (D23)
const ROLE_TOKENS: Record<MathRole, ThemeToken | null> = {
	placeholder: '--math-placeholder',
	latex: '--math-latex',
	smartFence: null,
	selection: '--editor-selection',
	macro: '--math-placeholder',
	error: '--math-error-tint',
	containsHighlight: null
};

/** a role's color: a fence MathLive closed for the writer takes the formula's own, a highlight around the caret none */
function roleColor(role: MathRole, token: ThemeTokenColor, color: string): string {
	const name = ROLE_TOKENS[role];
	if (name) return canvasFill(token(name));
	return role === 'smartFence' ? color : 'transparent';
}

/** the element's font families: a run without a family of its own draws in them */
function familyOf(style: ComputedStyle): string {
	return style.layout.font.families || 'serif';
}

/** a line's ascent and descent in px for the element's font at a line height */
export type FormulaStrut = (style: ComputedStyle, lineHeight: number) => { ascent: number; descent: number };

/** the static markup's line-height */
const STRUT_LINE_HEIGHT = 1.2;

function windowStrut(style: ComputedStyle, lineHeight: number): { ascent: number; descent: number } {
	const { ascent, descent } = windowFontMetrics()(canvasFontOf(style.layout.font));
	const leading = (lineHeight - ascent - descent) / 2;
	return { ascent: ascent + leading, descent: descent + leading };
}

/** an empty formula's placeholder holds no markup: its line is the element's own */
function lineHeightOf(source: MathSource, style: ComputedStyle): number {
	const own = style.layout.lineHeight;
	return source.source.trim() || own === 'normal' ? STRUT_LINE_HEIGHT * style.layout.font.sizePx : own;
}

/** what the element recorded when it was laid out at its font size; a math session reads it to place its layout */
export type FormulaPlacing = { size: number; family: string; ascent: number; descent: number };

/** an empty formula keeps room for its frame and the math caret */
const EMPTY_WIDTH_EM = 0.25;

export function formulaContent(
	source: MathSource,
	layouts: FormulaLayouts = windowFormulaLayouts(),
	strut: FormulaStrut = windowStrut,
	placed: (placing: FormulaPlacing) => void = () => {}
): ReplacedContent {
	let placing: FormulaPlacing = { size: 16, family: 'serif', ascent: 0, descent: 0 };
	return {
		keys: [{ kind: 'math', key: `${source.syntax}\0${layouts.keyOf(source)}\0${source.source}` }],
		intrinsic(style) {
			const size = style.layout.font.sizePx;
			const family = familyOf(style);
			const layout = layouts.layout(source, family);
			// the formula's box is its markup's line: the struts or the line of the font around it, the taller
			const line = strut(style, lineHeightOf(source, style));
			const ascent = Math.max(layout.ascent * size, line.ascent);
			const descent = Math.max(layout.descent * size, line.descent);
			placing = { size, family, ascent, descent };
			placed(placing);
			return { width: (layout.width > 0 ? layout.width : EMPTY_WIDTH_EM) * size, height: ascent + descent, baseline: ascent };
		},
		paint(ctx, box, style, token) {
			const layout = layouts.layout(source, placing.family);
			const color = canvasFill(style.color);
			paintMathLayout(ctx, layout, box.x - (layouts.scrollX?.() ?? 0), box.y + placing.ascent, {
				size: placing.size,
				family: placing.family,
				color,
				role: (role) => roleColor(role, token, color)
			});
		}
	};
}

/** the anchor geometry.partRect finds the formula's own box by */
export const FORMULA_PART = 'formula';

type EditedFormula = { layout(): MathLayout; scrollX(): number };

const edited = new WeakMap<FaceElement, EditedFormula>();
const placings = new WeakMap<FaceElement, FormulaPlacing>();
const lives = new WeakMap<FaceElement, { source: MathSource; layouts: FormulaLayouts }>();

/** a math session's layout drawn in the element in place of the formula's own, scrolled as the session is; null gives the formula back */
export function editFormula(el: FaceElement, session: EditedFormula | null): void {
	if (session) edited.set(el, session);
	else edited.delete(el);
}

/** the formula a math-formula element draws, for a copy of a face that leaves the canvas */
export function formulaSourceOf(el: FaceElement): MathSource | null {
	return lives.get(el)?.source ?? null;
}

/** what the element recorded when it was laid out */
export function formulaPlacingOf(el: FaceElement): FormulaPlacing | null {
	return placings.get(el) ?? null;
}

/** the layout the element draws (a session's while one edits it) at the place it recorded; null before it is laid out */
export function formulaLaidOut(el: FaceElement): { placing: FormulaPlacing; layout: MathLayout } | null {
	const placing = placings.get(el);
	const live = lives.get(el);
	return placing && live ? { placing, layout: live.layouts.layout(live.source, placing.family) } : null;
}

/** span.math-formula drawing the formula; ctx.math and renderStaticMath hand it to faces */
export function formulaElement(
	source: MathSource,
	layouts: FormulaLayouts = windowFormulaLayouts(),
	strut: FormulaStrut = windowStrut
): FaceElement {
	const el = faceElement('span', 'math-formula');
	el.anchor = FORMULA_PART;
	// the formula holds its layout: a frame paints every formula on screen, and the shared cache may have let it go
	let held: { family: string; macros: string; layout: MathLayout } | null = null;
	function heldLayout(formula: MathSource, family: string): MathLayout {
		const macros = layouts.keyOf(formula);
		if (held?.family !== family || held.macros !== macros) held = { family, macros, layout: layouts.layout(formula, family) };
		return held.layout;
	}
	const live: FormulaLayouts = {
		layout: (formula, family) => edited.get(el)?.layout() ?? heldLayout(formula, family),
		keyOf: (formula) => layouts.keyOf(formula),
		scrollX: () => edited.get(el)?.scrollX() ?? 0
	};
	el.replaced = formulaContent(source, live, strut, (placing) => placings.set(el, placing));
	lives.set(el, { source, layouts: live });
	return el;
}
