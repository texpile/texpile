// The one highlight style every CodeMirror in the app shares - source editor, raw islands, code
// blocks, diff panel - so LaTeX, Markdown and Typst colour the same construct the same way.
//
// The colours are the theme's --syntax-* variables (texpile-default-theme.css): light-dark pairs
// of GitHub Primer hues, picked so every role clears ~5:1 contrast on the light surface and ~7:1
// on the dark one and keeps its hue family across modes, so a file reads the same in both.
import type { Extension } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags, type Tag } from '@lezer/highlight';

type Role = {
	tag: Tag | readonly Tag[];
	/** a theme variable; omitted = default text colour (font-only role) */
	color?: string;
	fontWeight?: string;
	fontStyle?: string;
	textDecoration?: string;
};

// One row per semantic role. The tags cover what our three dialects emit: the LaTeX mode's
// tokenTable, typst-syntax-wasm's styleTags, @lezer/markdown, and the BibTeX mode - sub-tags
// (integer under number, controlKeyword under keyword, heading1-6 under heading) inherit.
const roles: Role[] = [
	// grey italic: comments, shebangs, raw-language annotations, md metadata
	{ tag: [tags.comment, tags.meta, tags.documentMeta, tags.annotation], color: 'var(--syntax-comment)', fontStyle: 'italic' },
	// red: keywords of every kind (control flow, let/set/show, and/or via tag inheritance),
	// math delimiters (LaTeX \[ $ / typst # $), and escapes
	{ tag: [tags.keyword, tags.escape], color: 'var(--syntax-keyword)' },
	// purple: imports (\usepackage, #import) - set off from other keywords like VS Code does
	{ tag: tags.moduleKeyword, color: 'var(--syntax-import)' },
	// blue: each dialect's syntax carrier, ONE hue across all three - LaTeX \commands and \item,
	// typst #func(), = and list markers, md's #/>/-/``` marks, bib fields. This is what makes the
	// three dialects read as one theme: LaTeX is carried by macros where md/typst are carried by
	// markers, so splitting those into two hues made the files look unrelated.
	// NO tags.list here: md's list rule covers the whole list SUBTREE (item text included), so a
	// colour on it paints prose - markers reach this role through their marker tags instead.
	{
		tag: [tags.function(tags.variableName), tags.propertyName, tags.processingInstruction, tags.definitionOperator],
		color: 'var(--syntax-command)'
	},
	// teal: identifiers inside math (\alpha, typst MathIdent)
	{ tag: tags.special(tags.variableName), color: 'var(--syntax-math-ident)' },
	// green: literal math text, labels and refs.
	// tags.quote is deliberately unstyled: md tags the whole blockquote SUBTREE and typst tags
	// every smart quote in prose with it, so any colour here paints body text
	{ tag: tags.special(tags.string), color: 'var(--syntax-math-text)' },
	{ tag: tags.labelName, color: 'var(--syntax-math-text)' },
	// orange: environment names and types, and all literals (numbers, bools, none/auto)
	{ tag: [tags.className, tags.typeName], color: 'var(--syntax-literal)' },
	{ tag: [tags.number, tags.bool, tags.literal, tags.atom], color: 'var(--syntax-literal)' },
	// dark blue: strings
	{ tag: tags.string, color: 'var(--syntax-string)' },
	// headings: bold in the DEFAULT text colour, all three dialects. The colour stays on the
	// marker (\section, =, #): the title is the document's own text, not syntax
	{ tag: tags.heading, fontWeight: 'bold' },
	// url gets the colour; link is underline-ONLY because md's Link rule spans the whole link
	// subtree, text included - colouring it painted "[Inline link]" instead of just the URL
	{ tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
	{ tag: tags.link, textDecoration: 'underline' },
	// amber: inline code / verbatim / raw
	{ tag: tags.monospace, color: 'var(--syntax-monospace)' },
	// pink: separators (\\, ---, linebreaks) and operators (&, ^, _)
	{ tag: [tags.contentSeparator, tags.operator], color: 'var(--syntax-operator)' },
	// font-only roles
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	// diffs and errors
	{ tag: tags.inserted, color: 'var(--syntax-inserted)' },
	{ tag: [tags.deleted, tags.invalid], color: 'var(--syntax-deleted)' }
];

const specs = roles.map(({ tag, color, fontWeight, fontStyle, textDecoration }) => ({
	tag,
	...(color ? { color } : {}),
	...(fontWeight ? { fontWeight } : {}),
	...(fontStyle ? { fontStyle } : {}),
	...(textDecoration ? { textDecoration } : {})
}));

/** every tag that carries a COLOUR (font-only roles excluded), exported for the bleed guard test:
 *  none of these may be a tag a grammar applies to whole subtrees of prose (tags.list, tags.quote,
 *  tags.content), or body text gets painted. */
export const colouredTags: Tag[] = roles.filter((r) => r.color).flatMap((r) => (Array.isArray(r.tag) ? [...r.tag] : [r.tag as Tag]));

const highlightStyle = HighlightStyle.define(specs);

/** syntax highlighting on the theme's --syntax-* variables; use instead of syntaxHighlighting(defaultHighlightStyle). */
export function cmSyntaxHighlight(): Extension {
	return syntaxHighlighting(highlightStyle);
}
