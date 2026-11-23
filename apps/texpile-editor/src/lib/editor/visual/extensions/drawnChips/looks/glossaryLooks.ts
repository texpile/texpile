import type { StyleLook } from '$lib/editor/canvas';

export const GLOSSARY_LOOKS: Readonly<Record<string, StyleLook>> = {
	'drawn-glossary': { borderBottom: 'var(--default-border-width) dotted var(--faint-text)' },
	'drawn-glossary-missing': { borderBottom: 'none', color: 'var(--color-ref-broken-fg)' }
};
