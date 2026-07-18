// source-mode live math preview: a tooltip above the cursor typesets the math region on every
// keystroke, rendered with mathlive so it matches what visual mode will show.
import { EditorView, keymap, showTooltip, type Tooltip, type TooltipView } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { convertLatexToMarkup } from 'mathlive';
import { get } from 'svelte/store';
import 'mathlive/static.css';
import 'mathlive/fonts.css';
import { settings, updateSettings } from '$lib/settings';
import { findMathRegions, mathRegionAt, type MathRegion } from './mathScanner';
import { mathMacrosFor } from './userMacros';

const previewDismissed = StateEffect.define<null>();

/** above this the preview silently disables instead of re-scanning megabytes per keystroke. */
const MAX_SCAN_LENGTH = 2_000_000;

const regionsField = StateField.define<MathRegion[]>({
	create: (state) => scan(state),
	update: (value, tr) => (tr.docChanged ? scan(tr.state) : value)
});

function scan(state: EditorState): MathRegion[] {
	if (state.doc.length > MAX_SCAN_LENGTH) return [];
	return findMathRegions(state.doc.toString());
}

function activeRegion(state: EditorState): MathRegion | null {
	const sel = state.selection.main;
	if (!sel.empty) return null;
	const region = mathRegionAt(state.field(regionsField), sel.head);
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
	return latex.replace(/\\(?:label|tag)\s*\{[^}]*\}/g, '');
}

function render(dom: HTMLElement, state: EditorState): void {
	const region = activeRegion(state);
	if (!region) return; // the tooltip is being removed this update anyway
	try {
		dom.innerHTML = convertLatexToMarkup(previewLatex(state, region), {
			defaultMode: region.kind === 'display' ? 'math' : 'inline-math',
			// user \newcommand/\DeclareMathOperator definitions (this file + project) render too
			macros: mathMacrosFor(state.doc.toString())
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
	const button = (icon: string, title: string, onClick: () => void) => {
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
	};
	button(ICON_X, 'Hide (Esc). Shows again next time the cursor enters math', () => view.dispatch({ effects: previewDismissed.of(null) }));
	button(ICON_EYE_OFF, 'Turn off. Re-enable in Preferences', () => {
		updateSettings({ mathPreview: false });
		view.dispatch({ effects: previewDismissed.of(null) }); // hide right away, the setting keeps it off
	});

	render(math, view.state);
	return {
		dom,
		offset: { x: 0, y: 6 },
		update(update) {
			if (update.docChanged || update.selectionSet) render(math, update.state);
		}
	};
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
	if (get(settings).mathPreview === false || state.field(dismissedField)) return null;
	if (!activeRegion(state)) return null;
	return { pos: state.selection.main.head, above: true, create: createPreview };
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
		padding: '0.4rem 2.6rem 0.4rem 0.7rem', // right padding clears the dismiss buttons
		borderRadius: '0.5rem',
		maxWidth: 'min(36rem, 90vw)',
		maxHeight: '40vh',
		overflow: 'hidden',
		fontSize: '1.05rem',
		position: 'relative',
		// glanceable only: clicks pass through to the code beneath and focus never leaves the editor
		pointerEvents: 'none'
	},
	'.cm-math-preview-controls': {
		position: 'absolute',
		top: '2px',
		right: '4px',
		display: 'flex',
		gap: '2px',
		pointerEvents: 'auto' // the one part of the preview that IS clickable
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
		background: 'rgba(128, 128, 128, 0.18)'
	}
});

/** live typeset preview of the math region under the cursor. latex source mode only. */
export function mathPreview(): Extension {
	// field order matters: dismissedField must settle before tooltipField reads it
	return [regionsField, dismissedField, tooltipField, dismissKeymap, previewTheme];
}
