// Skeleton's `> * + *` rules (label, select, date picker) name no class or tag for their subject, so Chromium restyles
// every later sibling's subtree whenever an element is added or removed anywhere: 100 ms of each Enter in a paper
export function withoutUniversalSiblings(selector: string): string {
	return selector.replace(/>\s*\*\s*\+\s*\*(?=\s*(?:,|$))/g, '> :where(:not(:first-child))');
}

/** a PostCSS plugin: a child that follows any sibling is a child that is not the first, with the same specificity */
export const noUniversalSiblings = {
	postcssPlugin: 'no-universal-siblings',
	Rule(rule: { selector: string }): void {
		if (rule.selector.includes('+')) rule.selector = withoutUniversalSiblings(rule.selector);
	}
};
