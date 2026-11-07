import { markdown, commonmarkLanguage } from '@codemirror/lang-markdown';
import { Language, defineLanguageFacet, type LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { Autolink, Strikethrough, TaskList, type MarkdownExtension, type MarkdownParser } from '@lezer/markdown';
import { bracketSyntax } from './bracketSyntax';
import { codeSyntax } from './codeSyntax';
import { footnoteSyntax } from './footnoteSyntax';
import { htmlSyntax } from './htmlSyntax';
import { mathSyntax } from './mathSyntax';
import { tableSyntax } from './tableSyntax';

const extensions: MarkdownExtension = [
	tableSyntax,
	TaskList,
	Strikethrough,
	Autolink,
	bracketSyntax,
	codeSyntax,
	mathSyntax,
	footnoteSyntax,
	htmlSyntax
];

export const markdownParser = (commonmarkLanguage.parser as MarkdownParser).configure(extensions);

const markdownLanguage = new Language(
	defineLanguageFacet({ commentTokens: { block: { open: '<!--', close: '-->' } } }),
	markdownParser,
	[],
	'markdown'
);

export function markdownSource(codeLanguages: readonly LanguageDescription[]): LanguageSupport {
	return markdown({ base: markdownLanguage, codeLanguages });
}
