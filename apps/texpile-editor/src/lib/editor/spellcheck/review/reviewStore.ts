// The reviews the model gave, by paragraph, and Harper's findings they were given for
import { settings } from '$lib/settings';
import { proofreadBridge } from '$lib/ai/proofread/proofreadBridge';
import { refineAgentsOffered } from '$lib/ai/refineAgents.svelte';
import type { LintMatch } from '../linter';
import { englishVariant, PROMPT_VERSION } from './reviewPrompt';
import { mergeReview } from './reviewMerge';
import { carriedReview, closestReviewed, type ReviewedText } from './reviewCarry';
import type { ParagraphReview, ReviewTarget } from './reviewTypes';

const MOST_KEPT = 3000;
const MOST_CARRIED_FROM = 200;

const reviews = new Map<string, ParagraphReview>();
// the review each paragraph text was last drawn with, so one that arrived since can be drawn
const drawnWith = new Map<string, string | null>();
// paragraphs last drawn with a review, by their text, for an edit of one to keep its marks while the model reads it again
const reviewedTexts = new Map<string, ReviewedText>();

export function proofreadOn(): boolean {
	return settings.current.proofreadAi && refineAgentsOffered().length > 0 && !!proofreadBridge();
}

/** a review stands for this text, these findings, this English and this prompt */
export function reviewKey(target: Pick<ReviewTarget, 'language' | 'linted' | 'matches'>): string {
	const found = target.matches.map((m) => `${m.rule}:${m.offset}:${m.length}`).join(',');
	return `${reviewContext(target.language)}|${found}|${target.linted}`;
}

function reviewContext(language: ReviewTarget['language']): string {
	return `${PROMPT_VERSION}|${language === 'en' ? englishVariant() : language}|${settings.current.uiLocale}`;
}

function remember<V>(map: Map<string, V>, key: string, value: V, most = MOST_KEPT): void {
	map.delete(key);
	map.set(key, value);
	if (map.size > most) map.delete(map.keys().next().value!);
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
	const shown = review ?? carriedTo(target);
	if (!shown) return target.matches;
	const { linted, matches } = target;
	remember(reviewedTexts, linted, { context: reviewContext(target.language), linted, matches, review: shown }, MOST_CARRIED_FROM);
	return mergeReview(target, shown, settings.current.grammarRules ?? {});
}

function carriedTo(target: ReviewTarget): ParagraphReview | null {
	const closest = closestReviewed(reviewedTexts.values(), reviewContext(target.language), target.linted);
	return closest && carriedReview(closest.from, target.matches, closest.edit);
}
