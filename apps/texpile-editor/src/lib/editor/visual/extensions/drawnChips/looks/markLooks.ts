import type { StyleLook } from '$lib/editor/canvas';

export const MARK_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-footnote': { marginLeft: '0.05em', fontSize: '0.75em', lineHeight: '0', color: 'var(--color-ref-fg)' },
	'drawn-label': {
		display: 'inline',
		color: 'var(--muted-text)',
		backgroundColor: 'var(--color-surface-200-800)',
		borderRadius: 'var(--radius-base)',
		paddingLeft: 'calc(var(--spacing) * 1.5)',
		paddingRight: 'calc(var(--spacing) * 1.5)',
		paddingTop: 'calc(var(--spacing) * 0.5)',
		paddingBottom: 'calc(var(--spacing) * 0.5)',
		verticalAlign: 'baseline',
		fontFamily: 'var(--font-mono)',
		fontSize: 'var(--text-xs)',
		lineHeight: 'var(--text-xs--line-height)'
	}
};
