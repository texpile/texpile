import type { Extension } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags, type Tag } from '@lezer/highlight';

type HighlightRole = {
	tag: Tag | readonly Tag[];
	/** a theme variable; omitted = default text color */
	color?: string;
	fontStyle?: string;
	fontWeight?: string;
	textDecoration?: string;
};

// Texpile's roles (editor/source/cmHighlight.ts) for the tags its LaTeX mode emits
const HIGHLIGHT_ROLES: HighlightRole[] = [
	{ tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
	{ tag: [tags.keyword, tags.escape], color: 'var(--syntax-keyword)' },
	{ tag: tags.moduleKeyword, color: 'var(--syntax-import)' },
	{ tag: [tags.function(tags.variableName), tags.processingInstruction], color: 'var(--syntax-command)' },
	{ tag: tags.special(tags.variableName), color: 'var(--syntax-math-ident)' },
	{ tag: [tags.special(tags.string), tags.labelName], color: 'var(--syntax-math-text)' },
	{ tag: tags.className, color: 'var(--syntax-literal)' },
	{ tag: tags.heading, fontWeight: 'bold' },
	{ tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
	{ tag: tags.monospace, color: 'var(--syntax-monospace)' },
	{ tag: [tags.contentSeparator, tags.operator], color: 'var(--syntax-operator)' }
];

const HIGHLIGHT_STYLE = HighlightStyle.define(HIGHLIGHT_ROLES);

export function cmSyntaxHighlight(): Extension {
	return syntaxHighlighting(HIGHLIGHT_STYLE);
}
