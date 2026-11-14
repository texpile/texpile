import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { Facet } from '@codemirror/state';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { latexEscapedBrackets } from './latexEscapedBrackets';
import { latexQuotePair } from './latexQuotePair';
import { latexHighlighter } from './highlight/latexHighlighter';
import { parser } from '../syntax/parser';
import { AT_LETTER, openConstructsFor } from '../syntax/tokens/openConstructs';
import { lineIndentation } from '$lib/editor/source/extensions/line-indent/lineIndent';

export const latexLanguage = LRLanguage.define({
	name: 'latex',
	parser,
	// the bracket pairs and the before-set are LaTeX Workshop's. `$` pairs as in Typst, so a formula being typed is
	// never left open and the live preview shows it on every key; \$ and $$ stay as typed (latexEscapedBrackets)
	languageData: {
		commentTokens: { line: '%' },
		closeBrackets: { brackets: ['(', '[', '{', '$'], before: ';:.,={}])>\\` \t$' },
		indentOnInput: /^\s*(?:[}\])]|\\end\{)$/
	}
});

// LaTeX Workshop's rule: every environment but the document indents its body
const latexIndentation = lineIndentation({
	trailingComment: /(?<!\\)(?:\\\\)*%.*$/,
	opensBlock: /\\begin\{(?!document\})([^}]*)\}(?!.*\\end\{\1\})/,
	closesLine: /^\s*(?:[}\])]|\\end\{(?!document\}))/
});

// package and class files, where `@` is a letter in command names throughout
export const latexPackageFile = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

export const latexPackageLanguage = latexLanguage.configure({ contextTracker: openConstructsFor(AT_LETTER) });

export function latex(packageFile = false): LanguageSupport {
	return new LanguageSupport(packageFile ? latexPackageLanguage : latexLanguage, [
		latexPackageFile.of(packageFile),
		latexIndentation,
		latexHighlighter,
		latexEscapedBrackets(),
		latexQuotePair(),
		closeBrackets(),
		keymap.of(closeBracketsKeymap)
	]);
}
