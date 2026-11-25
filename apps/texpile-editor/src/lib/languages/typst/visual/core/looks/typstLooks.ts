import type { StyleLook } from '$lib/editor/canvas';
import { classElementWith, type ClassLooks } from '$lib/editor/visual/extensions/drawnChips/looks/chipLooks';

const SPACE = 'var(--spacing)';

export const TYPST_LOOKS: ClassLooks = {
	looks: {
		'drawn-typst-quiet': { color: 'var(--faint-text)', fontSize: '0.85em' },
		'typ-environment': {
			position: 'relative',
			border: 'var(--default-border-width) solid var(--color-surface-200-800)',
			borderRadius: 'var(--radius-base)',
			padding: `calc(${SPACE} * 2) calc(${SPACE} * 3)`,
			margin: `calc(${SPACE} * 3) 0`
		},
		'typ-environment-theorem': { border: 'none', padding: '0' },
		'typ-env-heading': { display: 'flex', alignItems: 'baseline', gap: `calc(${SPACE} * 2)` },
		'typ-env-header': {
			display: 'flex',
			alignItems: 'baseline',
			justifyContent: 'space-between',
			marginBottom: `calc(${SPACE} * 1)`,
			userSelect: 'none'
		},
		'typ-env-header-theorem': { float: 'left', marginRight: '0.35em', marginBottom: '0' }
	}
};

/** the clear after a theorem-style card's body */
export const TYPST_BODY_AFTER_LOOK: StyleLook = { display: 'block', clear: 'both' };

export const typstElement = classElementWith(TYPST_LOOKS);
