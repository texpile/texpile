// a parsed text's highlight classes, as the source editor colors it: LaTeX by its span reader, the others by their tags
import type { Language } from '@codemirror/language';
import type { Tree } from '@lezer/common';
import { highlightTree } from '@lezer/highlight';
import { latexLanguage } from '$lib/languages/latex/source/latexLanguage';
import { KIND_TAGS, latexSpans } from '$lib/languages/latex/source/highlight/latexSpans';
import { highlightStyle } from './highlightStyle';

/** offsets into the text, ascending and apart; classes are the highlight style's generated ones */
export type HighlightedSpan = { readonly from: number; readonly to: number; readonly classes: string };

export function highlightedSpans(language: Language, tree: Tree, text: string): HighlightedSpan[] {
	const spans: HighlightedSpan[] = [];
	if (language === latexLanguage) {
		for (const span of latexSpans(tree, (from, to) => text.slice(from, to), 0, text.length)) {
			const classes = highlightStyle.style([KIND_TAGS[span.kind]]);
			if (classes) spans.push({ from: span.from, to: span.to, classes });
		}
		return spans;
	}
	highlightTree(tree, highlightStyle, (from, to, classes) => spans.push({ from, to, classes }));
	return spans;
}
