import { EditorView } from '@codemirror/view';

const FONT = 'var(--typo-base--font-family)';
const MONO = 'var(--font-mono)';
const LINE = 'var(--text-xs--line-height)';
const PAD = 'calc(var(--spacing) * 2)';

const CARD = {
	backgroundColor: 'var(--color-surface-50-950)',
	border: 'var(--default-border-width) solid var(--color-surface-300-700)',
	borderRadius: 'var(--radius-base)',
	boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
	color: 'var(--color-surface-950-50)',
	fontFamily: FONT,
	fontSize: 'var(--text-xs)',
	lineHeight: LINE,
	padding: PAD
};

// a hover tooltip is a wrapper of sections, one per source; each section is a card and the wrapper only stacks them
export const tooltipCardTheme = EditorView.theme({
	'.cm-tooltip:not(.cm-tooltip-hover), .cm-tooltip-hover > .cm-tooltip-section': CARD,
	'.cm-tooltip-hover': {
		display: 'flex',
		flexDirection: 'column',
		gap: 'calc(var(--spacing) * 1)',
		backgroundColor: 'transparent',
		border: 'none',
		boxShadow: 'none',
		padding: '0',
		backdropFilter: 'none'
	},
	'.cm-tooltip code, .cm-tooltip pre': { fontFamily: MONO, fontSize: 'inherit', background: 'none', padding: '0', border: 'none' },
	'.cm-argument-hint-active': { fontWeight: '700', color: 'var(--primary-ink)' },

	// the diagnostic and rename cards draw their own surface; the lint gutter's tooltip is the list itself
	'.cm-tooltip-hover > .cm-tooltip-lint, .cm-tooltip.cm-tooltip-lint, .cm-tooltip.cm-rename-card': {
		backgroundColor: 'transparent',
		border: 'none',
		boxShadow: 'none',
		padding: '0',
		backdropFilter: 'none'
	},
	'.cm-tooltip-lint': { display: 'flex', flexDirection: 'column', gap: 'calc(var(--spacing) * 1)', listStyle: 'none', margin: '0' },
	'.cm-tooltip-lint .cm-diagnostic': { padding: '0', margin: '0', border: 'none', whiteSpace: 'normal' },
	'.cm-tooltip-lint .cm-diagnosticText': { display: 'block' },

	'.cm-tooltip.cm-tooltip-autocomplete': { padding: 'calc(var(--spacing) * 1)' },
	'.cm-tooltip-autocomplete > ul': { fontFamily: MONO, maxHeight: '15em' },
	'.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
		display: 'flex',
		alignItems: 'center',
		gap: 'calc(var(--spacing) * 1.5)',
		padding: `calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5)`,
		borderRadius: 'calc(var(--radius-base) * 0.75)',
		lineHeight: LINE
	},
	'.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
		backgroundColor: 'var(--editor-selection)',
		color: 'inherit'
	},
	'.cm-tooltip-autocomplete .cm-completionIcon': { width: '1em', padding: '0', marginRight: '0', fontSize: '100%', opacity: '0.6' },
	'.cm-tooltip-autocomplete .cm-completionLabel': { flex: '1 1 auto', minWidth: '0' },
	'.cm-tooltip-autocomplete .cm-completionDetail': {
		marginLeft: 'calc(var(--spacing) * 3)',
		fontFamily: FONT,
		fontStyle: 'normal',
		opacity: '0.6'
	},
	'.cm-completionMatchedText': { color: 'var(--primary-ink)', textDecoration: 'none', fontWeight: '600' },
	'.cm-tooltip.cm-completionInfo': { padding: PAD, maxWidth: '280px' }
});
