// the theme tokens the core base reads, as the DOM editor computed them (styles/tokens.json of texpile-tools), for a unit run with no engine
import type { ThemeTokenText } from '$lib/editor/canvas/contracts/styleTypes';

const SCALE = 1.067;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

function shared(): Record<string, string> {
	const sizes: Record<string, number> = {
		'--text-sm': 14,
		'--text-base': 16,
		'--text-lg': 18,
		'--text-xl': 20,
		'--text-2xl': 24,
		'--text-3xl': 30,
		'--text-4xl': 36
	};
	const tokens: Record<string, string> = {
		'--spacing': '4px',
		'--radius-base': '4px',
		'--default-border-width': '1px',
		'--leading-relaxed': '1.625',
		'--text-base--line-height': String((Math.round(24 * SCALE * SCALE * 0.5) * 2 + 0.001) / (Math.round(16 * SCALE * 64) / 64)),
		'--text-sm--line-height': String((Math.round(20 * SCALE * SCALE * 0.5) * 2 + 0.001) / (Math.round(14 * SCALE * 64) / 64)),
		'--typo-base--font-family': 'system-ui',
		'--typo-heading--font-family': 'system-ui',
		'--font-mono': MONO,
		'--muted-text': 'color-mix(in oklab, currentColor 60%, transparent)',
		'--selected-node-outline': 'rgb(136, 204, 255)',
		'--color-primary-500': 'oklch(0.6266 0.19 252.79)'
	};
	for (const [name, px] of Object.entries(sizes)) tokens[name] = `${px * SCALE}px`;
	return tokens;
}

// the island highlight roles and the formula frames
const LIGHT_COLORS: Record<string, string> = {
	'--syntax-command': 'rgb(5, 80, 174)',
	'--syntax-comment': 'rgb(89, 99, 110)',
	'--syntax-deleted': 'rgb(130, 7, 30)',
	'--syntax-import': 'rgb(130, 80, 223)',
	'--syntax-inserted': 'rgb(17, 99, 41)',
	'--syntax-keyword': 'rgb(207, 34, 46)',
	'--syntax-literal': 'rgb(149, 56, 0)',
	'--syntax-math-ident': 'rgb(27, 124, 131)',
	'--syntax-math-text': 'rgb(17, 99, 41)',
	'--syntax-monospace': 'rgb(125, 78, 0)',
	'--syntax-operator': 'rgb(191, 57, 137)',
	'--syntax-string': 'rgb(10, 48, 105)',
	'--syntax-url': 'rgb(9, 105, 218)',
	'--mathfield-focus-border': 'oklch(0.3863 0.01 243.95)',
	'--color-error-500': 'oklch(0.5722 0.22 358.61)',
	'--math-empty-tint': 'rgb(239, 68, 68)'
};
const DARK_COLORS: Record<string, string> = {
	'--syntax-command': 'rgb(121, 192, 255)',
	'--syntax-comment': 'rgb(145, 152, 161)',
	'--syntax-deleted': 'rgb(255, 161, 152)',
	'--syntax-import': 'rgb(210, 168, 255)',
	'--syntax-inserted': 'rgb(126, 231, 135)',
	'--syntax-keyword': 'rgb(255, 123, 114)',
	'--syntax-literal': 'rgb(255, 166, 87)',
	'--syntax-math-ident': 'rgb(86, 212, 221)',
	'--syntax-math-text': 'rgb(126, 231, 135)',
	'--syntax-monospace': 'rgb(227, 179, 65)',
	'--syntax-operator': 'rgb(247, 120, 186)',
	'--syntax-string': 'rgb(165, 214, 255)',
	'--syntax-url': 'rgb(88, 166, 255)',
	'--mathfield-focus-border': 'oklch(0.707 0.02 248.11)',
	'--color-error-500': 'oklch(0.67 0.2 358.61)',
	'--math-empty-tint': 'rgb(239, 68, 68)'
};

export function parityTokens(scheme: 'light' | 'dark'): ThemeTokenText {
	const light = scheme === 'light';
	const tokens = {
		...shared(),
		...(light ? LIGHT_COLORS : DARK_COLORS),
		'--color-surface-950-50': light ? 'oklch(0.3863 0.01 243.95)' : 'oklch(0.9851 0 none)',
		'--color-surface-200-800': light ? 'oklch(0.8485 0.01 247.93)' : 'oklch(0.4884 0.02 251.01)',
		'--page-sheet': light ? '#fff' : 'oklch(98.5% 0.002 247.839)'
	};
	return (name) => (tokens as Record<string, string>)[name] ?? null;
}
