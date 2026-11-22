export function pageShadow(dark: boolean): string {
	return dark
		? 'drop-shadow(0 2px 8px rgb(0 0 0 / 0.55)) drop-shadow(0 1px 3px rgb(0 0 0 / 0.4))'
		: 'drop-shadow(0 2px 8px rgb(0 0 0 / 0.12)) drop-shadow(0 1px 3px rgb(0 0 0 / 0.08))';
}

/** px between a page and the pane's side at fit width, as the PDF viewer leaves */
export const PAGE_SIDE_GAP = 20;

const PDF_SPACING: [string, string][] = [
	[
		'const computedScale = container.width ? container.width / maxWidth : 1;',
		`const computedScale = container.width ? (container.width - ${2 * PAGE_SIDE_GAP}) / maxWidth : 1;`
	],
	[
		'const heightMargin = this.isContentPreview ? 6 * scale : 5 * scale;',
		'const heightMargin = this.isContentPreview ? 6 * scale : 8 * scale;'
	],
	['const widthMargin = 0;', `const widthMargin = ${PAGE_SIDE_GAP} * scale;`],
	[
		'const calculatedPaddedY = accumulatedHeight + (i == 0 ? 0 : heightMargin);',
		'const calculatedPaddedY = accumulatedHeight + (i == 0 ? 20 * scale : heightMargin);'
	],
	['const newHeight = accumulatedHeight;', 'const newHeight = accumulatedHeight + 20 * scale;']
];

export function withPdfSpacing(html: string): string {
	if (!PDF_SPACING.every(([from]) => html.includes(from))) return html;
	let out = html;
	for (const [from, to] of PDF_SPACING) out = out.replace(from, to);
	return out;
}
