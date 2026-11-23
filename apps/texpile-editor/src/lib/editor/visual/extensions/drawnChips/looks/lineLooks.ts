import type { StyleLook } from '$lib/editor/canvas';

const RULE = 'var(--default-border-width) solid currentColor';
const BLOCK_MARGIN = 'calc(var(--spacing) * 2) 0';

export const LINE_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-comment': {
		display: 'block',
		overflow: 'hidden',
		fontSize: '0.85em',
		color: 'var(--faint-text)',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap'
	},
	'drawn-comment-marker': { fontFamily: 'var(--font-mono)' },
	'drawn-comment-more': { marginLeft: '0.6em', fontSize: '0.85em' },
	'drawn-divider': {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75em',
		margin: BLOCK_MARGIN,
		borderLeft: RULE,
		borderRight: RULE,
		fontSize: '0.7rem',
		letterSpacing: '0.06em',
		textTransform: 'uppercase',
		color: 'var(--faint-text)'
	},
	'drawn-divider-label': { textTransform: 'none', letterSpacing: 'normal' },
	'latex-placeholder': {
		textAlign: 'center',
		fontSize: '0.7rem',
		letterSpacing: '0.06em',
		textTransform: 'uppercase',
		color: 'var(--faint-text)',
		userSelect: 'none',
		cursor: 'pointer',
		padding: '0.2rem 0',
		margin: BLOCK_MARGIN,
		borderRadius: 'var(--radius-base)'
	}
};

/** the rules before and after a divider's label */
export const DIVIDER_RULE_LOOK: StyleLook = { flex: '1', borderTop: RULE };

export const LINE_HOVER_LOOKS: Readonly<Record<string, StyleLook>> = { 'latex-placeholder': { color: 'var(--muted-text)' } };
