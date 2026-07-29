// Static typeset of a math node, used as a stand-in until the real MathfieldElement is built.
//
// This is mathlive's own renderer, the same one the live field paints itself with, so swapping the
// placeholder for the field is visually a no-op. That is the whole reason not to reach for KaTeX
// here: a second engine would lay the same latex out slightly differently and every equation would
// twitch the moment it went live.
//
// No user macros are passed, deliberately. The live field in this bridge is not configured with
// them either, so leaving them out is what keeps the two renders identical - including how both
// render an unknown macro as an error box.
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';

export const PLACEHOLDER_CLASS = 'math-static-placeholder';

/** typeset `latex` into a detached element sized the same as the field that will replace it */
export function renderStaticMath(latex: string, isBlock: boolean): HTMLElement {
	const el = document.createElement(isBlock ? 'div' : 'span');
	el.className = PLACEHOLDER_CLASS;
	// it lives inside prosemirror's contenteditable, and unlike a MathfieldElement it has nothing of
	// its own guarding the caret, so say plainly that it cannot be typed into
	el.contentEditable = 'false';
	// the generated markup marks its visual half aria-hidden, so name the node for screen readers
	el.setAttribute('role', 'math');
	el.setAttribute('aria-label', latex);
	setStaticMath(el, latex);
	return el;
}

/** re-typeset an existing placeholder in place, for edits that land while it is still offscreen */
export function setStaticMath(el: HTMLElement, latex: string): void {
	el.setAttribute('aria-label', latex);
	try {
		// 'math' matches MathfieldElement's own default mode; anything else would resize on upgrade
		el.innerHTML = convertLatexToMarkup(latex, { defaultMode: 'math' });
	} catch {
		// mathlive throws outright on some malformed input. Fall back to the source text so the node
		// still occupies roughly the right space instead of collapsing to nothing.
		el.textContent = latex;
	}
}
