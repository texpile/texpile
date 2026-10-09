// lints prose in the language it is written in: Harper for English, spelling and grammar; a dictionary for the others,
// spelling only. Suggestions for a dictionary's words are found when the suggestion box opens
import type { LintOptions } from 'harper.js';
import { m } from '$lib/paraglide/messages';
import { lintText, tagReplacements, type LintResult } from '../linter';
import { SPELLING_RULE } from '../config/grammarRules';
import { findMisspellings } from './dictionaryClient';
import { spellLanguageName } from './spellingLanguage.svelte';
import type { SpellLanguage } from './spellLanguages';
import './personalWords';

/** a null language checks nothing: the document is in one without a dictionary here */
export async function proofreadIn(
	language: SpellLanguage | null,
	text: string,
	options?: { markup?: LintOptions['language']; isStale?: () => boolean }
): Promise<LintResult> {
	if (language === 'en') return lintText(text, { language: options?.markup, isStale: options?.isStale });
	if (!language) return { matches: [] };
	const spans = await findMisspellings(language, text);
	if (!spans) return { matches: [], failed: true };
	const message = m.spelling_not_in_dictionary({ language: spellLanguageName(language) });
	return {
		matches: spans.map(({ offset, length }) => {
			const replacements: string[] = [];
			tagReplacements(replacements, { rule: SPELLING_RULE, language });
			return { offset, length, message, shortMessage: message, type: { typeName: 'Spelling' }, replacements, rule: SPELLING_RULE };
		})
	};
}
