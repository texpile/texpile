import type { StyleLook } from '$lib/editor/canvas';

const MONO: StyleLook = { fontFamily: 'var(--font-mono)', fontSize: '0.9em' };
const FAINT: StyleLook = { color: 'var(--faint-text)' };

export const DEFINITION_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-definitions': {
		display: 'grid',
		gridTemplateColumns: 'max-content max-content minmax(0px, 1fr)',
		alignItems: 'baseline',
		columnGap: '0.5em',
		fontSize: '0.85em',
		color: 'var(--muted-text)'
	},
	'drawn-definition-name': { ...MONO, whiteSpace: 'nowrap' },
	'drawn-definition-code': MONO,
	'drawn-definition-made': { ...MONO, ...FAINT },
	'drawn-definition-params': FAINT,
	'drawn-definition-sign': FAINT,
	'drawn-definition-body': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
};
