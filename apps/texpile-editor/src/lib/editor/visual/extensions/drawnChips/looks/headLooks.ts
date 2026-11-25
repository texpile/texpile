import type { StyleLook } from '$lib/editor/canvas';

const HALF_RADIUS = 'calc(var(--radius-base) * 0.5)';

export const HEAD_LOOKS: Readonly<Record<string, StyleLook>> = {
	'env-head': { font: 'inherit', cursor: 'pointer', borderRadius: HALF_RADIUS },
	'env-head-name': { fontWeight: '700' },
	'env-label': {
		fontSize: '0.7rem',
		letterSpacing: '0.06em',
		textTransform: 'uppercase',
		color: 'var(--faint-text)',
		cursor: 'pointer',
		borderRadius: HALF_RADIUS
	}
};

export const HEAD_HOVER_LOOKS: Readonly<Record<string, StyleLook>> = {
	'env-head': { backgroundColor: 'color-mix(in srgb, var(--color-surface-500) 12%, transparent)' },
	'env-label': { color: 'var(--muted-text)' }
};

// remark style
export const REMARK_HEAD_NAME_LOOK: StyleLook = { fontWeight: '400', fontStyle: 'italic' };
