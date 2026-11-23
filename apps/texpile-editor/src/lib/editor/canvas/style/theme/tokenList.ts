// the custom properties the editor's rules read (S1.0 tokens.json), plus the root ones its theme rules need

// shares are read as text because a percentage has no size without a box

export const COLOR_TOKENS = [
	'--color-error-500',
	'--color-primary-500',
	'--color-ref-bg',
	'--color-ref-broken-bg',
	'--color-ref-broken-fg',
	'--color-ref-fg',
	'--color-secondary-500',
	'--color-success-500',
	'--color-surface-100',
	'--color-surface-200',
	'--color-surface-200-800',
	'--color-surface-300',
	'--color-surface-300-700',
	'--color-surface-400',
	'--color-surface-50',
	'--color-surface-50-950',
	'--color-surface-500',
	'--color-surface-600',
	'--color-surface-700',
	'--color-surface-800',
	'--color-surface-900',
	'--color-surface-950',
	'--color-surface-950-50',
	'--color-warning-100',
	'--color-warning-400',
	'--color-warning-500',
	'--color-warning-700',
	'--color-warning-950',
	'--comment-tint',
	'--diff-delete-tint',
	'--diff-highlight-tint',
	'--diff-insert-tint',
	'--editor-selection',
	'--error-ink',
	'--error-on-tonal',
	'--error-tonal',
	'--error-tonal-hover',
	'--faint-text',
	'--find-match-active-bg',
	'--find-match-bg',
	'--git-added',
	'--git-deleted',
	'--git-modified',
	'--glass-line',
	'--image-frame',
	'--math-empty-tint',
	'--math-error-tint',
	'--math-key-down',
	'--math-key-hover',
	'--math-latex',
	'--math-placeholder',
	'--math-preview-btn-hover',
	'--mathfield-focus-border',
	'--muted-text',
	'--page-sheet',
	'--primary-ink',
	'--primary-on-tonal',
	'--primary-tint',
	'--primary-tonal',
	'--primary-tonal-hover',
	'--proof-capitalization',
	'--proof-default',
	'--proof-repetition',
	'--proof-spelling',
	'--proof-style',
	'--proof-typo',
	'--proof-wordchoice',
	'--ref-fg',
	'--secondary-on-tonal',
	'--secondary-tonal',
	'--secondary-tonal-hover',
	'--selected-node-outline',
	'--solid-surface-50',
	'--solid-surface-900',
	'--solid-surface-950',
	'--success-ink',
	'--success-on-tonal',
	'--success-tonal',
	'--success-tonal-hover',
	'--surface-wash',
	'--syntax-command',
	'--syntax-comment',
	'--syntax-deleted',
	'--syntax-import',
	'--syntax-inserted',
	'--syntax-keyword',
	'--syntax-literal',
	'--syntax-math-ident',
	'--syntax-math-text',
	'--syntax-monospace',
	'--syntax-operator',
	'--syntax-string',
	'--syntax-url',
	'--tertiary-on-tonal',
	'--tertiary-tonal',
	'--tertiary-tonal-hover',
	'--tonal-hover',
	'--typo-anchor--color-dark',
	'--typo-anchor--color-light',
	'--warning-ink',
	'--warning-on-tonal',
	'--warning-tonal',
	'--warning-tonal-hover'
] as const;

export const LENGTH_TOKENS = [
	'--default-border-width',
	'--find-right',
	'--find-top',
	'--glass-sheet-blur',
	'--radius-base',
	'--spacing',
	'--text-2xl',
	'--text-3xl',
	'--text-4xl',
	'--text-base',
	'--text-lg',
	'--text-sm',
	'--text-size',
	'--text-xl',
	'--text-xs'
] as const;

export const FONT_TOKENS = ['--font-mono', '--font-sans', '--typo-base--font-family', '--typo-heading--font-family'] as const;

export const TEXT_TOKENS = [
	'--faint-share',
	'--leading-relaxed',
	'--muted-share',
	'--text-base--line-height',
	'--text-scaling',
	'--text-sm--line-height',
	'--text-xs--line-height',
	'--typo-anchor--text-decoration-line'
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type LengthToken = (typeof LENGTH_TOKENS)[number];
export type FontToken = (typeof FONT_TOKENS)[number];
export type TextToken = (typeof TEXT_TOKENS)[number];
export type TokenName = ColorToken | LengthToken | FontToken | TextToken;

const TOKEN_NAMES: ReadonlySet<string> = new Set<string>([...COLOR_TOKENS, ...LENGTH_TOKENS, ...FONT_TOKENS, ...TEXT_TOKENS]);

export function isTokenName(name: string): name is TokenName {
	return TOKEN_NAMES.has(name);
}

/** a declaration that names a token off the list is a mistake in a node view; it throws in dev */
export function assertTokenName(name: string, dev = import.meta.env?.DEV ?? false): void {
	if (dev && !TOKEN_NAMES.has(name)) throw new Error(`${name} is not a theme token; add it to tokenList.ts`);
}
