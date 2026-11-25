// the one highlight style of every CodeMirror and canvas island; --syntax-* holds Primer hues at about 5:1 contrast on light and 7:1 on dark
import { HighlightStyle } from '@codemirror/language';
import { tags, type Tag } from '@lezer/highlight';

type Role = {
	tag: Tag | readonly Tag[];
	/** a theme variable; omitted for a font-only role */
	color?: string;
	fontWeight?: string;
	fontStyle?: string;
	textDecoration?: string;
};

// one row per role over the LaTeX tokenTable, typst-syntax-wasm's styleTags, @lezer/markdown and BibTeX; sub-tags inherit
const roles: Role[] = [
	{ tag: [tags.comment, tags.meta, tags.documentMeta, tags.annotation], color: 'var(--syntax-comment)', fontStyle: 'italic' },
	{ tag: [tags.keyword, tags.escape], color: 'var(--syntax-keyword)' },
	// imports set off from other keywords as VS Code does
	{ tag: tags.moduleKeyword, color: 'var(--syntax-import)' },
	// one hue for every dialect's syntax carrier (macros, markers), so the three read as one theme
	// no tags.list: Markdown tags the whole list subtree, item text included
	{
		tag: [tags.function(tags.variableName), tags.propertyName, tags.processingInstruction, tags.definitionOperator],
		color: 'var(--syntax-command)'
	},
	{ tag: tags.special(tags.variableName), color: 'var(--syntax-math-ident)' },
	// no tags.quote: Markdown tags whole blockquotes and Typst every smart quote in prose
	{ tag: tags.special(tags.string), color: 'var(--syntax-math-text)' },
	{ tag: tags.labelName, color: 'var(--syntax-math-text)' },
	{ tag: [tags.className, tags.typeName], color: 'var(--syntax-literal)' },
	{ tag: [tags.number, tags.bool, tags.literal, tags.atom], color: 'var(--syntax-literal)' },
	{ tag: tags.string, color: 'var(--syntax-string)' },
	// a heading's title keeps the text color; its marker carries the hue
	{ tag: tags.heading, fontWeight: 'bold' },
	// link only underlines because Markdown's Link rule spans the link text too
	{ tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
	{ tag: tags.link, textDecoration: 'underline' },
	{ tag: tags.monospace, color: 'var(--syntax-monospace)' },
	{ tag: [tags.contentSeparator, tags.operator], color: 'var(--syntax-operator)' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
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

export const coloredTags: Tag[] = roles.filter((r) => r.color).flatMap((r) => (Array.isArray(r.tag) ? [...r.tag] : [r.tag as Tag]));

export const highlightStyle = HighlightStyle.define(specs);
