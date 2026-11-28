// The reviews the model gave, by paragraph, and Harper's findings they were given for
import { settings } from '$lib/settings';
import { proofreadBridge } from '$lib/ai/proofread/proofreadBridge';
import { agentOffered } from '$lib/ai/agent/aiAgent.svelte';
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
	return settings.current.proofreadAi && agentOffered() !== null && !!proofreadBridge();
}

/** on, with AI features on, waiting only for an agent */
export function proofreadHinted(): boolean {
	return settings.current.proofreadAi && !settings.current.aiOff && agentOffered() === null && !!proofreadBridge();
}

// by the text checked, so a paragraph is read once
const keysOfLinted = new Map<string, string>();

/** a review stands for the text the model reads, these findings, this English and this prompt; the same in every
 *  editor, so a paragraph reviewed in the visual editor is reviewed in Source and Problems too */
export function reviewKey(target: ReviewTarget): string {
	const context = reviewContext(target.language);
	const checked = `${context}|${target.matches.map((m) => `${m.rule}:${m.offset}:${m.length}`).join(',')}|${target.linted}`;
	const known = keysOfLinted.get(checked);
	if (known) return known;
	const found = target.matches.map((m) => `${m.rule}:${target.linted.slice(m.offset, m.offset + m.length).replace(/\s+/g, ' ')}`).join(',');
	const key = `${context}|${found}|${target.reading().text}`;
	remember(keysOfLinted, checked, key);
	return key;
}

function reviewContext(language: ReviewTarget['language']): string {
	return `${PROMPT_VERSION}|${language === 'en' ? englishVariant() : language}`;
}

function remember<V>(map: Map<string, V>, key: string, value: V, most = MOST_KEPT): void {
	map.delete(key);
	map.set(key, value);
	if (map.size > most) map.delete(map.keys().next().value!);
}

export function reviewOf(key: string): ParagraphReview | undefined {
	return reviews.get(key);
}

const keptListeners = new Set<() => void>();

/** a review came in, for whichever editor asked */
export function onReviewKept(fn: () => void): () => void {
	keptListeners.add(fn);
	return () => keptListeners.delete(fn);
}

export function keepReview(key: string, review: ParagraphReview): void {
	remember(reviews, key, review);
	keptListeners.forEach((fn) => fn());
}

/** false when the text is drawn without the review it now has */
export function drawnCurrent(target: ReviewTarget): boolean {
	const key = reviewKey(target);
	return !reviews.has(key) || drawnWith.get(target.linted) === key;
}

/** Harper's findings, reviewed when a review is in; until then as Harper gave them. `drawn` false for a reader that draws no marks */
export function reviewedMatches(target: ReviewTarget, drawn = true): LintMatch[] {
	if (!proofreadOn()) return target.matches;
	const key = reviewKey(target);
	const review = reviews.get(key);
	if (drawn) remember(drawnWith, target.linted, review ? key : null);
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
