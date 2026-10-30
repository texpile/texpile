import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { Facet } from '@codemirror/state';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { latexEscapedBrackets } from './latexEscapedBrackets';
import { latexQuotePair } from './latexQuotePair';
import { latexHighlighter } from './highlight/latexHighlighter';
import { parser } from '../syntax/parser';
import { AT_LETTER, openConstructsFor } from '../syntax/tokens/openConstructs';

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

// package and class files, where `@` is a letter in command names throughout
export const latexPackageFile = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

export const latexPackageLanguage = latexLanguage.configure({ contextTracker: openConstructsFor(AT_LETTER) });

export function latex(packageFile = false): LanguageSupport {
	return new LanguageSupport(packageFile ? latexPackageLanguage : latexLanguage, [
		latexPackageFile.of(packageFile),
		latexHighlighter,
		latexEscapedBrackets(),
		latexQuotePair(),
		closeBrackets(),
		keymap.of(closeBracketsKeymap)
	]);
}
