import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { latexEscapedBrackets } from './latexEscapedBrackets';
import { latexQuotePair } from './latexQuotePair';
import { latexHighlighter } from './highlight/latexHighlighter';
import { parser } from './tree/parser';

export const latexLanguage = LRLanguage.define({
	name: 'latex',
	parser,
	// the pairs and the before-set are LaTeX Workshop's; `$` deliberately not among them there or
	// here: \$ for currency and $$ display math both fight a same-character auto-close
	languageData: {
		commentTokens: { line: '%' },
		closeBrackets: { brackets: ['(', '[', '{'], before: ';:.,={}])>\\` \t$' }
	}
});

export function latex(): LanguageSupport {
	return new LanguageSupport(latexLanguage, [
		latexHighlighter,
		latexEscapedBrackets(),
		latexQuotePair(),
		closeBrackets(),
		keymap.of(closeBracketsKeymap)
	]);
}
