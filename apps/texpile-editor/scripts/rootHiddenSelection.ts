/** A PostCSS plugin: ProseMirror's `.ProseMirror-hideselection *::selection` goes. A rule on the page that names
 *  everything under it restyles the whole document when the class comes and goes; highlight/hiddenSelection.ts hides
 *  the selection on the node that holds it */
export const noRootHiddenSelection = {
	postcssPlugin: 'no-root-hidden-selection',
	Rule(rule: { selector: string; remove(): void }): void {
		if (/^\.ProseMirror-hideselection \*::(-moz-)?selection$/.test(rule.selector.trim())) rule.remove();
	}
};
