import type { StyleLook } from '$lib/editor/canvas';

const MONO = 'var(--font-mono)';

export const TITLE_LOOKS: Readonly<Record<string, StyleLook>> = {
	'title-matter': { margin: 'calc(var(--spacing) * 1.5) 0', textAlign: 'center', lineHeight: '1.35', overflowWrap: 'anywhere' },
	'title-matter-title': { fontSize: '1.6rem', fontWeight: '700', lineHeight: '1.25' },
	'title-matter-author': { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 2em', fontSize: '1.1rem' },
	'title-matter-affiliation': { fontSize: '0.9rem', color: 'var(--muted-text)' },
	'title-matter-note': { fontSize: '0.9rem', color: 'var(--muted-text)' },
	'title-matter-email': { fontSize: '0.8rem', color: 'var(--muted-text)', fontFamily: MONO },
	'title-matter-keywords': { fontSize: '0.85rem' },
	'title-matter-classification': { fontSize: '0.85rem' },
	'title-matter-label': {
		marginRight: '0.5em',
		fontSize: '0.7rem',
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		color: 'var(--muted-text)'
	},
	'title-matter-running': { fontSize: '0.75rem', color: 'var(--faint-text)' },
	'title-matter-empty': { fontSize: '0.75rem', color: 'var(--faint-text)', fontFamily: MONO },
	'title-matter-mark': { marginLeft: '0.05em', fontSize: '0.75em', lineHeight: '0' },
	'title-matter-subtitle': { fontSize: '1.2rem' },
	'title-matter-abstract': { textAlign: 'justify', fontSize: '0.9rem' },
	'title-matter-abstract-label': { display: 'block', margin: '0 0 0.25em', textAlign: 'center' }
};
