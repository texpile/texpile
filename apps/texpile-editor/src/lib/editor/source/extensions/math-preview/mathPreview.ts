// source-mode live math preview: a tooltip above the math typesets it on every keystroke, rendered with
// mathlive so it matches what visual mode will show.
import { EditorView, keymap, showTooltip, type Rect, type Tooltip, type TooltipView } from '@codemirror/view';
import { Facet, StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';
import 'mathlive/fonts.css';
import { settings, updateSettings } from '$lib/settings';
import { docText } from '$lib/editor/source/docText';
import { mathRegionAt, type MathRegion } from './mathScanner';
import { scanSourceMath } from './sourceMath';
import { mathMacrosFor } from './userMacros';
import { withoutKeyDefinitions } from '$lib/languages/latex/knowledge/calls/roleKeys';

const previewDismissed = StateEffect.define<null>();
const markdownSource = Facet.define<boolean, boolean>({ combine: (values) => values[0] ?? false });

/** above this the preview silently disables instead of re-scanning megabytes per keystroke. */
const MAX_SCAN_LENGTH = 2_000_000;

// regions: null = not scanned yet; regionsFor fills the cell in place on first need, which also
// makes turning the preview setting back on rescan lazily, no transaction required
type RegionCell = { regions: MathRegion[] | null };

const regionsField = StateField.define<RegionCell>({
	create: () => ({ regions: null }),
	update(value, tr) {
		if (!tr.docChanged) return value;
		const markdown = tr.state.facet(markdownSource);
		return { regions: value.regions === null ? null : updateRegions(value.regions, tr, markdown) };
	}
});

function scan(state: EditorState): MathRegion[] {
	if (state.doc.length > MAX_SCAN_LENGTH) return [];
	return scanSourceMath(docText(state.doc), state.facet(markdownSource)).math;
}

/** the math the caret sits in, between its delimiters; null outside math or in an editor without the preview */
export function mathAtCaret(state: EditorState): MathRegion | null {
	const cell = state.field(regionsField, false);
	if (!cell) return null;
	const head = state.selection.main.head;
	const region = mathRegionAt((cell.regions ??= scan(state)), head);
	return region && head >= region.innerFrom && head <= region.innerTo ? region : null;
}

function regionsFor(state: EditorState): MathRegion[] {
	if (settings.current.mathPreview === false) return []; // preview off: never pay for a scan
	const cell = state.field(regionsField);
	if (cell.regions === null) cell.regions = scan(state);
	return cell.regions;
}

const LATEX_DELIMITERS = /[\\$]/;
// plus what bounds Markdown code: backticks, tilde fences, link destinations, autolinks
const MARKDOWN_DELIMITERS = /[\\$`~\]<]/;
// indentation and list markers decide whether a line is code
const MARKDOWN_LINE_PREFIX = /^[ \t]*(?:[-+*]|\d{1,9}[.)]?)?[ \t]*/;

// a full rescan is O(doc), so when a change is provably inert — stays on one line, no `\` or `$`
// on that line or its neighbors, at least a line away from every region — just shift the old
// regions through the edit. Anything else returns null = lazy full rescan.
function updateRegions(regions: MathRegion[], tr: Transaction, markdown: boolean): MathRegion[] | null {
	const delimiters = markdown ? MARKDOWN_DELIMITERS : LATEX_DELIMITERS;
	let inert = true;
	tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
		if (!inert) return;
		const oldDoc = tr.startState.doc;
		const lineA = oldDoc.lineAt(fromA);
		// inserted or deleted newlines move blank-line clamps and comment/line boundaries
		if (inserted.lines > 1 || toA > lineA.to || delimiters.test(oldDoc.sliceString(fromA, toA))) {
			inert = false;
			return;
		}
		if (markdown && fromA <= lineA.from + (MARKDOWN_LINE_PREFIX.exec(lineA.text)?.[0].length ?? 0)) {
			inert = false;
			return;
		}
		const newDoc = tr.newDoc;
		const lineB = newDoc.lineAt(fromB);
		const ctxFrom = lineB.number > 1 ? newDoc.line(lineB.number - 1).from : lineB.from;
		const ctxTo = lineB.number < newDoc.lines ? newDoc.line(lineB.number + 1).to : lineB.to;
		if (delimiters.test(newDoc.sliceString(ctxFrom, ctxTo))) {
			inert = false;
			return;
		}
		const oldFrom = lineA.number > 1 ? oldDoc.line(lineA.number - 1).from : lineA.from;
		const oldTo = lineA.number < oldDoc.lines ? oldDoc.line(lineA.number + 1).to : lineA.to;
		if (touchesRegion(regions, oldFrom, oldTo)) inert = false;
	});
	if (!inert) return null;
	return regions.map((r) => {
		const m: MathRegion = {
			from: tr.changes.mapPos(r.from),
			to: tr.changes.mapPos(r.to),
			innerFrom: tr.changes.mapPos(r.innerFrom),
			innerTo: tr.changes.mapPos(r.innerTo),
			kind: r.kind
		};
		if (r.env !== undefined) m.env = r.env;
		if (r.unclosed) m.unclosed = true;
		return m;
	});
}

// regions are sorted and disjoint, so only the last one starting at or before `to` can overlap
function touchesRegion(regions: MathRegion[], from: number, to: number): boolean {
	let lo = 0;
	let hi = regions.length - 1;
	let last = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (regions[mid].from <= to) {
			last = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return last >= 0 && regions[last].to >= from;
}

function activeRegion(state: EditorState): MathRegion | null {
	const sel = state.selection.main;
	if (!sel.empty) return null;
	const region = mathRegionAt(regionsFor(state), sel.head);
	if (!region) return null;
	// nothing to render yet, the user just typed the opening delimiter
	if (!state.sliceDoc(region.innerFrom, region.innerTo).trim()) return null;
	return region;
}

// Esc (or the ✕ button) hides the preview for THIS visit only: the flag clears the moment the
// cursor leaves math, so entering any region shows the preview again
const dismissedField = StateField.define<boolean>({
	create: () => false,
	update(value, tr) {
		if (tr.effects.some((e) => e.is(previewDismissed))) return true;
		if (value && !activeRegion(tr.state)) return false;
		return value;
	}
});

function previewLatex(state: EditorState, region: MathRegion): string {
	let latex: string;
	if (region.env) {
		// environments affect layout (align columns, gather centering), so keep \begin…\end;
		// synthesize the \end while the user is still typing it
		latex = state.sliceDoc(region.from, region.to);
		if (region.unclosed) latex += `\\end{${region.env}}`;
	} else {
		latex = state.sliceDoc(region.innerFrom, region.innerTo);
	}
	// \label / \tag are cross-referencing noise the preview can't resolve, drop them
	return withoutKeyDefinitions(latex, 'label').replace(/\\tag\s*\{[^}]*\}/g, '');
}

function render(dom: HTMLElement, state: EditorState): void {
	const region = activeRegion(state);
	if (!region) return; // the tooltip is being removed this update anyway
	try {
		// eslint-disable-next-line no-param-reassign -- the tooltip renders by writing the handed element
		dom.innerHTML = convertLatexToMarkup(previewLatex(state, region), {
			defaultMode: region.kind === 'display' ? 'math' : 'inline-math',
			// user \newcommand/\DeclareMathOperator definitions (this file + project) render too
			macros: mathMacrosFor(docText(state.doc))
		});
	} catch {
		// mathlive rejects some mid-edit input outright, keep the last good render on screen
	}
}

// module-level so every tooltip shares one `create` identity: that's what makes CodeMirror
// reuse the DOM across updates instead of recreating it per keystroke
// lucide X and EyeOff, inlined (this module has no component layer to import icons through)
const ICON_X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const ICON_EYE_OFF =
	'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';

function iconSvg(paths: string): string {
	return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function createPreview(view: EditorView): TooltipView {
	const dom = document.createElement('div');
	dom.className = 'cm-math-preview';
	const math = dom.appendChild(document.createElement('div'));
	math.setAttribute('aria-hidden', 'true');

	const controls = dom.appendChild(document.createElement('div'));
	controls.className = 'cm-math-preview-controls';
	function button(icon: string, title: string, onClick: () => void) {
		const b = controls.appendChild(document.createElement('button'));
		b.type = 'button';
		b.innerHTML = iconSvg(icon);
		b.title = title;
		b.setAttribute('aria-label', title);
		// mousedown, not click: the editor must keep focus and the tooltip must not re-position first
		b.onmousedown = (e) => {
			e.preventDefault();
			onClick();
		};
	}
	button(ICON_X, 'Hide (Esc). Shows again next time the cursor enters math', () => view.dispatch({ effects: previewDismissed.of(null) }));
	button(ICON_EYE_OFF, 'Turn off. Re-enable in Preferences', () => {
		updateSettings({ mathPreview: false });
		view.dispatch({ effects: previewDismissed.of(null) }); // hide right away, the setting keeps it off
	});

	// scrolling it or pressing on it keeps the caret in the editor
	dom.onmousedown = (e) => e.preventDefault();

	render(math, view.state);
	return {
		dom,
		offset: { x: 0, y: 6 },
		getCoords: (pos) => anchorBox(view, pos, dom),
		mount() {
			fitPreview(view, dom, math);
		},
		update(update) {
			if (update.docChanged || update.selectionSet) render(math, update.state);
			if (update.docChanged || update.selectionSet || update.geometryChanged) fitPreview(view, dom, math);
		}
	};
}

/**
 * the whole math block, so the preview sits above its first line or, with no room there, below its last; over the
 * caret only when the block fills the editor
 */
function anchorBox(view: EditorView, pos: number, dom: HTMLElement): Rect {
	const caret = view.coordsAtPos(view.state.selection.main.head) ?? { left: 0, right: 0, top: 0, bottom: 0 };
	const region = activeRegion(view.state);
	const start = region && view.coordsAtPos(Math.max(region.from, view.viewport.from));
	const end = region && view.coordsAtPos(Math.min(region.to, view.viewport.to), -1);
	if (!start || !end) return view.coordsAtPos(pos) ?? caret;
	const room = view.scrollDOM.getBoundingClientRect();
	const needed = Math.min(dom.offsetHeight, 3 * view.defaultLineHeight) + 8;
	if (start.top - room.top < needed && room.bottom - end.bottom < needed) return caret;
	return { left: start.left, right: start.right, top: start.top, bottom: end.bottom };
}

// below this a long equation scrolls instead of shrinking further
const SMALLEST = 0.7;
const MOST_HEIGHT = 0.5;

/** as wide as the editor and up to half the window tall; a bigger equation shrinks a little, then scrolls */
function fitPreview(view: EditorView, dom: HTMLElement, math: HTMLElement): void {
	/* eslint-disable no-param-reassign -- sizing the tooltip's own elements */
	const width = Math.max(320, view.scrollDOM.clientWidth - 24);
	dom.style.maxWidth = `${width}px`;
	dom.style.maxHeight = `${Math.round(window.innerHeight * MOST_HEIGHT)}px`;
	math.style.fontSize = '';
	const style = getComputedStyle(dom);
	const roomWidth = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	const roomHeight = window.innerHeight * MOST_HEIGHT - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
	let scale = 1;
	// twice: the drawing has parts that do not scale with the font, so the first guess can fall a few pixels short
	for (let pass = 0; pass < 2; pass++) {
		const fits = Math.min(1, roomWidth / math.offsetWidth, roomHeight / math.offsetHeight);
		if (fits >= 1 || scale <= SMALLEST) break;
		scale = Math.max(SMALLEST, scale * fits * 0.99);
		math.style.fontSize = `${scale}em`;
	}
	/* eslint-enable no-param-reassign */
}

const tooltipField = StateField.define<Tooltip | null>({
	create: (state) => tooltipFor(state),
	update(value, tr) {
		if (tr.effects.some((e) => e.is(previewDismissed))) return null;
		if (!tr.docChanged && !tr.selection) return value;
		return tooltipFor(tr.state);
	},
	provide: (f) => showTooltip.from(f)
});

function tooltipFor(state: EditorState): Tooltip | null {
	if (settings.current.mathPreview === false || state.field(dismissedField)) return null;
	const region = activeRegion(state);
	if (!region) return null;
	return { pos: region.from, above: true, create: createPreview };
}

// Esc hides the current preview; yields when no preview is up so completion/search keep their Esc
const dismissKeymap = keymap.of([
	{
		key: 'Escape',
		run(view) {
			if (view.state.field(dismissedField) || !view.state.field(tooltipField)) return false;
			view.dispatch({ effects: previewDismissed.of(null) });
			return true;
		}
	}
]);

const previewTheme = EditorView.baseTheme({
	'.cm-tooltip.cm-math-preview': {
		display: 'flex',
		alignItems: 'flex-start',
		gap: '0.5rem',
		padding: '0.4rem 0.3rem 0.4rem 0.7rem',
		borderRadius: '0.5rem',
		overflow: 'auto',
		fontSize: '1.05rem'
	},
	'.cm-math-preview > div:first-child': {
		flex: 'none'
	},
	'.cm-math-preview-controls': {
		// stays in the corner while a long equation scrolls under it
		position: 'sticky',
		top: '0',
		right: '0',
		marginLeft: 'auto',
		display: 'flex',
		gap: '2px',
		background: 'inherit'
	},
	'.cm-math-preview-controls button': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '18px',
		height: '18px',
		padding: '0',
		border: 'none',
		borderRadius: '4px',
		background: 'transparent',
		color: 'inherit',
		opacity: '0.4',
		cursor: 'pointer'
	},
	'.cm-math-preview-controls button:hover': {
		opacity: '1',
		background: 'var(--math-preview-btn-hover)'
	}
});

/** live typeset preview of the math region under the cursor; `markdown`: % is text, and $ follows pandoc */
export function mathPreview({ markdown = false }: { markdown?: boolean } = {}): Extension {
	// field order matters: dismissedField must settle before tooltipField reads it
	return [markdownSource.of(markdown), regionsField, dismissedField, tooltipField, dismissKeymap, previewTheme];
}
