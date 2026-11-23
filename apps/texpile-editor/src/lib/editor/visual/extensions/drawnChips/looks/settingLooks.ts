import type { StyleLook } from '$lib/editor/canvas';

export const SETTING_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-settings': { display: 'block' },
	'drawn-setting': {
		display: 'block',
		overflow: 'hidden',
		fontSize: '0.85em',
		color: 'var(--muted-text)',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap'
	},
	'drawn-setting-target': { fontWeight: '600' },
	'drawn-setting-code': { fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
	'drawn-setting-more': { marginLeft: '0.6em', fontSize: '0.85em', color: 'var(--faint-text)' }
};
