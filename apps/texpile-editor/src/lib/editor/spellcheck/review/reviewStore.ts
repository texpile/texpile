// The reviews the model gave, by paragraph, and Harper's findings they were given for
import { settings } from '$lib/settings';
import { proofreadBridge } from '$lib/ai/proofread/proofreadBridge';
import type { LintMatch } from '../linter';
import { englishVariant, PROMPT_VERSION } from './reviewPrompt';
import { mergeReview } from './reviewMerge';
import type { ParagraphReview, ReviewTarget } from './reviewTypes';

const MOST_KEPT = 3000;

const reviews = new Map<string, ParagraphReview>();
// the review each paragraph text was last drawn with, so one that arrived since can be drawn
const drawnWith = new Map<string, string | null>();

export function proofreadOn(): boolean {
	return settings.current.proofreadAi && !settings.current.aiOff && !!proofreadBridge();
}

/** a review stands for this text, these findings, this English and this prompt */
export function reviewKey(target: Pick<ReviewTarget, 'language' | 'linted' | 'matches'>): string {
	const found = target.matches.map((m) => `${m.rule}:${m.offset}:${m.length}`).join(',');
	const language = target.language === 'en' ? englishVariant() : target.language;
	return `${PROMPT_VERSION}|${language}|${settings.current.uiLocale}|${found}|${target.linted}`;
}

function remember<V>(map: Map<string, V>, key: string, value: V): void {
	map.delete(key);
	map.set(key, value);
	if (map.size > MOST_KEPT) map.delete(map.keys().next().value!);
}

export function reviewOf(key: string): ParagraphReview | undefined {
	return reviews.get(key);
}

export function keepReview(key: string, review: ParagraphReview): void {
	remember(reviews, key, review);
}

/** false when the text is drawn without the review it now has */
export function drawnCurrent(target: ReviewTarget): boolean {
	const key = reviewKey(target);
	return !reviews.has(key) || drawnWith.get(target.linted) === key;
}

/** Harper's findings, reviewed when a review is in; until then as Harper gave them */
export function reviewedMatches(target: ReviewTarget): LintMatch[] {
	if (!proofreadOn()) return target.matches;
	const key = reviewKey(target);
	const review = reviews.get(key);
	remember(drawnWith, target.linted, review ? key : null);
	return review ? mergeReview(target, review, settings.current.grammarRules ?? {}) : target.matches;
}
