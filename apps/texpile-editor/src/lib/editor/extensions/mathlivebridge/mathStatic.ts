// Placeholders standing in for math node views until a real MathfieldElement is built.
//
// There are three stages, not two, and the middle one exists because of a measurement: typesetting
// every placeholder at mount cost ~1.1 s of frozen UI on a 1048-equation document, which just moved
// the freeze rather than removing it.
//
//   1. mount        cheap box, size estimated from the latex. Costs almost nothing.
//   2. idle         real typeset, in document order, in slices that yield to the browser.
//   3. near viewport  the actual MathfieldElement takes over (see mathViewport.ts).
//
// So opening a document is never blocked on typesetting, sizes converge within a second or so, and
// anything the reader can reach is the real thing. Stage 2 also means a fast scroll finds properly
// rendered math rather than empty boxes.
//
// The typeset is mathlive's own renderer, the same one the live field paints itself with, so the
// swap at stage 3 is visually a no-op. That is the reason not to reach for KaTeX: a second engine
// would lay the same latex out differently and every equation would twitch as it went live.
//
// No user macros are passed, deliberately. The live field in this bridge is not configured with
// them either, so leaving them out is what keeps the two renders identical.
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';

export const PLACEHOLDER_CLASS = 'math-static-placeholder';

/** how much of a slice to spend typesetting before handing the thread back */
const SLICE_MS = 5;
/** rough height of one line of display math, in em */
const BLOCK_LINE_EM = 2.2;

const latexOf = new WeakMap<HTMLElement, string>();
const pending = new Set<HTMLElement>();
let draining = false;

/** Rendered width of a latex fragment in `ch`, roughly: commands collapse to about one glyph, and
 * braces and sub/superscript markers vanish. It only has to be close. Anything within about 1.5
 * screens is upgraded before it is seen, and browser scroll anchoring absorbs the corrections made
 * to content above the viewport. */
function estimateWidthCh(latex: string): number {
	const collapsed = latex
		.replace(/\\[a-zA-Z]+/g, 'x')
		.replace(/[{}$&]/g, '')
		.replace(/[\^_]/g, '');
	return Math.max(1, collapsed.length);
}

function estimateLines(latex: string): number {
	return (latex.match(/\\\\/g)?.length ?? 0) + 1;
}

function applyEstimate(el: HTMLElement, latex: string, isBlock: boolean): void {
	if (isBlock) {
		el.style.height = `${(estimateLines(latex) * BLOCK_LINE_EM).toFixed(1)}em`;
		el.style.width = '100%';
	} else {
		el.style.display = 'inline-block';
		el.style.width = `${estimateWidthCh(latex)}ch`;
		el.style.height = '1em';
	}
}

const idle: (cb: () => void) => void =
	typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(() => cb()) : (cb) => setTimeout(cb, 0);

function scheduleDrain(): void {
	if (draining || pending.size === 0) return;
	draining = true;
	idle(drain);
}

function drain(): void {
	draining = false;
	const start = performance.now();
	// insertion order is document order, since node views are built top-down: typeset what the
	// reader is nearest to first
	for (const el of pending) {
		pending.delete(el);
		// dropped from the document, or already upgraded to a live field
		if (!el.isConnected) continue;
		typeset(el, latexOf.get(el) ?? '');
		if (performance.now() - start > SLICE_MS) break;
	}
	scheduleDrain();
}

function typeset(el: HTMLElement, latex: string): void {
	try {
		// 'math' matches MathfieldElement's own default mode; anything else would resize on upgrade
		el.innerHTML = convertLatexToMarkup(latex, { defaultMode: 'math' });
	} catch {
		// mathlive throws outright on some malformed input. Fall back to the source text so the node
		// still occupies roughly the right space instead of collapsing to nothing.
		el.textContent = latex;
		return;
	}
	// the real render supersedes the estimate; let the content decide the box from here
	el.style.width = '';
	el.style.height = '';
}

/** a cheap, roughly-sized stand-in, queued for typesetting once the thread is free */
export function renderStaticMath(latex: string, isBlock: boolean): HTMLElement {
	const el = document.createElement(isBlock ? 'div' : 'span');
	el.className = PLACEHOLDER_CLASS;
	// it lives inside prosemirror's contenteditable, and unlike a MathfieldElement it has nothing of
	// its own guarding the caret, so say plainly that it cannot be typed into
	el.contentEditable = 'false';
	// the generated markup marks its visual half aria-hidden, so name the node for screen readers
	el.setAttribute('role', 'math');
	el.setAttribute('aria-label', latex);
	el.dataset.block = String(isBlock);
	latexOf.set(el, latex);
	applyEstimate(el, latex, isBlock);
	pending.add(el);
	scheduleDrain();
	return el;
}

/** re-render a placeholder for an edit that landed while it was still offscreen */
export function setStaticMath(el: HTMLElement, latex: string): void {
	el.setAttribute('aria-label', latex);
	latexOf.set(el, latex);
	if (pending.has(el)) {
		// not typeset yet: just re-estimate, the queue will pick up the new latex
		applyEstimate(el, latex, el.dataset.block === 'true');
		return;
	}
	typeset(el, latex);
}

/** stop tracking a placeholder that has been replaced by a live field or removed */
export function cancelStaticMath(el: HTMLElement): void {
	pending.delete(el);
}
