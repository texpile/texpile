// the theme tokens a unit run resolves the core base with: plain values, no engine
import type { ThemeToken, ThemeTokenText } from '$lib/editor/canvas';
import { COLOR_TOKENS, FONT_TOKENS, isTokenName, LENGTH_TOKENS } from '$lib/editor/canvas/style/theme/tokenList';

export const FIXED_TOKENS: Readonly<Record<string, string>> = {
	'--spacing': '4px',
	'--radius-base': '4px',
	'--text-base': '16px',
	'--text-base--line-height': '1.5',
	'--leading-relaxed': '1.625',
	'--typo-base--font-family': 'serif',
	'--typo-heading--font-family': 'serif',
	'--font-mono': 'monospace',
	'--muted-text': 'color-mix(in oklab, currentColor 60%, transparent)',
	'--selected-node-outline': 'rgb(136, 204, 255)',
	'--color-primary-500': 'rgb(0, 102, 204)',
	'--color-error-500': 'rgb(204, 0, 0)',
	'--color-surface-950-50': 'rgb(0, 0, 0)',
	'--color-surface-200-800': 'rgb(200, 200, 200)',
	'--page-sheet': 'rgb(255, 255, 255)',
	'--editor-selection': 'rgb(180, 210, 255)'
};

const COLORS = new Set<string>(COLOR_TOKENS);
const LENGTHS = new Set<string>(LENGTH_TOKENS);
const FONTS = new Set<string>(FONT_TOKENS);

/** the rest of the list: black, zero, serif and a factor of one */
function plainValue(name: string): string {
	return COLORS.has(name) ? 'rgb(0, 0, 0)' : LENGTHS.has(name) ? '0px' : FONTS.has(name) ? 'serif' : '1';
}

/** extra: tokens a test sets, over the fixed ones; a name off the token list is null, as the theme read gives it */
export function fixedTokenText(extra: Readonly<Record<string, string>> = {}): ThemeTokenText {
	return (name: ThemeToken) => extra[name] ?? FIXED_TOKENS[name] ?? (isTokenName(name) ? plainValue(name) : null);
}
