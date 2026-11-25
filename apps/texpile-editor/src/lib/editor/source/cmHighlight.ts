// the source editor's highlighting: the one style every CodeMirror and the canvas islands share (editor/code)
import type { Extension } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { highlightStyle } from '$lib/editor/code/highlightStyle';

/** syntax highlighting on the theme's --syntax-* variables; use instead of syntaxHighlighting(defaultHighlightStyle). */
export function cmSyntaxHighlight(): Extension {
	return syntaxHighlighting(highlightStyle);
}
