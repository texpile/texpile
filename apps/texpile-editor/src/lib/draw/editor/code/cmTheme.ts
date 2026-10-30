import { EditorView } from '@codemirror/view';

// Texpile's source editor: its gutterTheme and the font rules of SourceEditor.svelte
export const CM_THEME = EditorView.theme({
	'&': { height: '100%', fontSize: '0.875rem' },
	// scroll-inset-r: the splitter's grab zone overhangs the scrollbar's edge
	'.cm-scroller': {
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
		lineHeight: '1.6',
		scrollbarGutter: 'stable',
		borderRight: '3px solid transparent'
	},
	'.cm-content': { padding: 'calc(var(--spacing) * 4) 0' },
	// the caret is drawn centered on its position, so column 0 needs half a caret of room
	'.cm-line': { paddingLeft: '2px' },
	'.cm-gutters': { userSelect: 'none', WebkitUserSelect: 'none' },
	'.cm-lineNumbers .cm-gutterElement': {
		padding: '0 2px 0 3px',
		minWidth: 'calc(3ch + 2px + 3px)',
		textAlign: 'center'
	},
	// the selection's statements, whole lines in the light blue a browser selects text with (Highlight itself is a
	// strong blue on some systems, which the code's colors do not read on), and their numbers
	'.cm-line.cm-tikz-statement': { backgroundColor: 'light-dark(#b4d7ff, #264f78)' },
	'.cm-gutterElement.cm-tikz-statement-number': { color: 'var(--primary-ink)', fontWeight: '600' },
	'.cm-foldGutter .cm-gutterElement': { padding: '0 3px', cursor: 'pointer', opacity: '0.6' },
	// a collapsed region shows what it holds, as a chip in the text
	'.cm-foldPlaceholder': {
		margin: '0 2px',
		padding: '0 6px',
		border: 'none',
		borderRadius: '4px',
		backgroundColor: 'light-dark(#e8e8ec, #2f3036)',
		color: 'light-dark(#55575f, #b4b6bf)',
		fontFamily: 'ui-sans-serif, system-ui, sans-serif',
		fontSize: '0.75rem',
		cursor: 'pointer'
	}
});
