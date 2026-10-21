import { EditorView } from '@codemirror/view';

// flat dots in the theme's colors; CM's stock markers are gradient images
function lintMarker(color: string) {
	return { content: 'normal', backgroundColor: color, clipPath: 'circle(37.5%)' };
}

export const gutterTheme = EditorView.theme({
	// gutters aren't content: without this, double-clicking a line number or a fold arrow selects it
	'.cm-gutters': { userSelect: 'none', WebkitUserSelect: 'none' },
	// tight padding: this cell sits BETWEEN the lint and fold rails, which carry their own.
	// three digits of floor so the text stops shifting every power of ten
	'.cm-lineNumbers .cm-gutterElement': {
		padding: '0 2px 0 3px',
		minWidth: 'calc(3ch + 2px + 3px)',
		textAlign: 'center'
	},
	// both icon rails are cut close to their icon and the slack sits on the OUTER side, so the dot
	// and the chevron gather in against the line numbers instead of out against the window and the text
	'.cm-gutter-lint': { width: '1.3em' },
	// pinned: a gutter is as wide as its widest marker, so the text would slide sideways the
	// moment the first parse produced fold ranges
	'.cm-foldGutter': { width: '18px' },
	// all of it on the right: the chevron is a flex item, so any left pad shrinks the icon itself
	'.cm-foldGutter .cm-gutterElement': { padding: '0 4px 0 0' },
	// flex-centre: stock CM leaves the marker inline, sitting above the line-number baseline
	'.cm-gutter-lint .cm-gutterElement': { padding: '0 2px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
	'.cm-lint-marker': { width: '0.7em', height: '0.7em' },
	'.cm-lint-marker-error': lintMarker('var(--color-error-500)'),
	'.cm-lint-marker-warning': lintMarker('var(--color-warning-500)'),
	'.cm-lint-marker-info': lintMarker('var(--color-primary-500)')
});

// y-codemirror.next's stock theme shifts text: its line selections and caret trade padding for
// margins that do not cancel out. pin both so a peer's cursor can never move a glyph on this screen
export const yRemoteLayoutFix = EditorView.theme({
	'.cm-yLineSelection': { margin: '0', padding: '0 2px 0 0' },
	'.cm-ySelectionCaret': { border: 'none', margin: '0' },
	'.cm-ySelectionCaret::before': {
		content: "''",
		position: 'absolute',
		top: '0',
		bottom: '0',
		left: '-1px',
		width: '2px',
		backgroundColor: 'inherit'
	}
});
