// Spelling findings the model recognized as names or field terms, into the dictionary when the writer allows it
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { addWordsToDocumentDictionary, removeWordFromDocumentDictionary } from '../linter';
import { SPELLING_RULE } from '../config/grammarRules';
import { readableSpellText } from '../blockSpellText';
import { addLanguageWords, removeLanguageWord } from '../languages/personalWords';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { ParagraphReview, ReviewTarget } from './reviewTypes';

// one word, as a dictionary holds it: a whole phrase marked as a term is the model guessing
const ONE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;

type Reviewed = { target: ReviewTarget; review: ParagraphReview };

/** a batch is one language */
export function recognizedTerms(reviewed: readonly Reviewed[]): string[] {
	const words = new Set<string>();
	for (const { target, review } of reviewed)
		target.matches.forEach((match, id) => {
			if (match.rule !== SPELLING_RULE || review.verdicts.get(id)?.verdict !== 'term') return;
			const word = readableSpellText(target.linted.slice(match.offset, match.offset + match.length));
			if (ONE_WORD.test(word)) words.add(word);
		});
	return [...words];
}

/** English's list is Harper's; the others are each dictionary's own */
async function addWords(language: SpellLanguage, words: string[]): Promise<{ added: string[]; undo(): void }> {
	if (language === 'en') {
		const added = await addWordsToDocumentDictionary(words);
		return { added, undo: () => void Promise.all(added.map((word) => removeWordFromDocumentDictionary(word))) };
	}
	const added = addLanguageWords(language, words);
	return { added, undo: () => added.forEach((word) => removeLanguageWord(language, word)) };
}

export async function addRecognizedTerms(reviewed: readonly Reviewed[]): Promise<void> {
	if (!settings.current.proofreadAddTerms || !reviewed.length) return;
	const terms = recognizedTerms(reviewed);
	if (!terms.length) return;
	const { added, undo } = await addWords(reviewed[0].target.language, terms);
	if (!added.length) return;
	// the dictionary keeps them in lower case; the toast names them as written
	const shown = terms.filter((t) => added.includes(t.toLowerCase()));
	toaster.info({
		title: m.proofread_terms_added({ words: shown.join(', ') }),
		duration: 6000,
		action: { label: m.menubar_undo(), onClick: undo }
	});
}
