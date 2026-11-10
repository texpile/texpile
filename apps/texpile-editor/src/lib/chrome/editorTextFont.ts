const GENERIC_FAMILIES = new Set([
	'system-ui',
	'ui-sans-serif',
	'ui-serif',
	'ui-monospace',
	'ui-rounded',
	'sans-serif',
	'serif',
	'monospace',
	'cursive',
	'fantasy',
	'inherit',
	'initial'
]);

/** the inline value of --editor-text-font: the chosen family, then the theme's own font for a family no longer installed */
export function textFontValue(family: string): string {
	return `"${family.replace(/["\\]/g, '')}", var(--typo-base--font-family)`;
}

/** the first named family of a font-family list, or '' when the list starts with a system keyword */
export function themeFontName(fontFamily: string): string {
	const first =
		fontFamily
			.split(',')[0]
			?.trim()
			.replace(/^["']|["']$/g, '') ?? '';
	return GENERIC_FAMILIES.has(first.toLowerCase()) ? '' : first;
}
