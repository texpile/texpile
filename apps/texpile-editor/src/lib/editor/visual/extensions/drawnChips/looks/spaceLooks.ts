import type { StyleLook } from '$lib/editor/canvas';

const RULE = 'var(--default-border-width) solid var(--faint-text)';
const ROOM: StyleLook = { display: 'inline-block', height: '0.6em', verticalAlign: 'baseline' };
const LABEL: StyleLook = { fontFamily: 'var(--font-mono)', fontSize: '0.7em', lineHeight: '1' };
const HOVER: StyleLook = { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' };

export const SPACE_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-vspace': { display: 'flex', alignItems: 'center', gap: '0.4em', color: 'var(--faint-text)' },
	'drawn-vspace-arrow': {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		alignSelf: 'stretch',
		flex: 'none',
		width: '9px',
		marginLeft: '4px',
		marginRight: '4px'
	},
	'drawn-space-command': LABEL,
	'drawn-space-length': LABEL,
	'drawn-space': ROOM,
	'drawn-hspace': { ...ROOM, borderTop: 'none', borderRight: RULE, borderBottom: RULE, borderLeft: RULE }
};

export const SPACE_HOVER_LOOKS: Readonly<Record<string, StyleLook>> = { 'drawn-space': HOVER, 'drawn-hspace': HOVER };

/** a pull to the left draws as a tick with its closing edges off */
export const NEGATIVE_HSPACE_LOOK: StyleLook = { width: '0', borderRight: 'none', borderBottom: 'none' };
