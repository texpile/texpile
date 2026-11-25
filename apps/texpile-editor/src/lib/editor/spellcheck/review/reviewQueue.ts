// When paragraphs go to the model: the ones on screen, once the writer has paused, a few at a time
import { box } from '$lib/runes/box.svelte';
import { observe } from '$lib/runes/observe.svelte';
import { proofreadBridge } from '$lib/ai/proofread/proofreadBridge';
import { noteProofreadResult } from '$lib/ai/proofread/proofreadStatus.svelte';
import { markLintsStale } from '../linter';
import { addRecognizedTerms } from './reviewTerms';
import { parseReview, reviewRequest, reviewSystem } from './reviewPrompt';
import { drawnCurrent, keepReview, proofreadOn, reviewKey, reviewOf } from './reviewStore';
import type { ParagraphReview, ReviewTarget } from './reviewTypes';

/** an editor's paragraphs on screen, and a way to draw some again once their review is in */
export type ReviewSource = { visible(): ReviewTarget[]; redraw(linted: ReadonlySet<string>): void };

// a paragraph is done changing once the writer stops for this long
const AFTER_EDIT_MS = 4000;
const AFTER_SCROLL_MS = 1500;
const AFTER_FAILURE_MS = 30_000;
const RETRY_AFTER_MS = 120_000;
const BATCH_PARAGRAPHS = 6;
const BATCH_CHARS = 4000;
const FEWEST_WORDS = 4;

type Pending = { target: ReviewTarget; key: string; source: ReviewSource };

const sources = new Set<ReviewSource>();
const sending = new Set<string>();
const failedAt = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = 0;
let pausedUntil = 0;
let listening = false;

const ASKED_SOURCE: ReviewSource = { visible: () => [], redraw: () => {} };
// paragraphs a writer asked for by name (Proofread document with AI), sent after the ones on screen
const asked: Pending[] = [];

/** how many asked-for paragraphs are still to go out or come back */
export const reviewsAsked = box(0);
/** asked-for paragraphs since the queue last ran empty */
export const reviewsAskedTotal = box(0);
/** why the last asked-for run stopped short */
export const reviewsAskedError = box<string | null>(null);

function noteAsked(): void {
	reviewsAsked.current = asked.length;
	if (!asked.length) reviewsAskedTotal.current = 0;
}

export function registerReviewSource(source: ReviewSource): () => void {
	sources.add(source);
	if (!listening) {
		listening = true;
		document.addEventListener('scroll', () => reviewSoon(AFTER_SCROLL_MS), { capture: true, passive: true });
	}
	return () => sources.delete(source);
}

/** an edit or a lint: the paragraphs on screen go out once things are quiet for `ms` */
export function reviewSoon(ms = AFTER_EDIT_MS): void {
	if (!proofreadOn()) return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(sendVisible, ms);
}

function wanted(target: ReviewTarget, key: string, now: number): boolean {
	if (reviewOf(key) || sending.has(key) || now - (failedAt.get(key) ?? -Infinity) < RETRY_AFTER_MS) return false;
	return target.matches.length > 0 || target.reading().text.split(/\s+/).filter(Boolean).length >= FEWEST_WORDS;
}

function pendingOnScreen(): Pending[] {
	const now = Date.now();
	const out = new Map<string, Pending>();
	for (const source of sources) {
		const targets = source.visible();
		const stale = new Set(targets.filter((t) => !drawnCurrent(t)).map((t) => t.linted));
		if (stale.size) source.redraw(stale);
		for (const target of targets) {
			const key = reviewKey(target);
			if (!out.has(key) && wanted(target, key, now)) out.set(key, { target, key, source });
		}
	}
	return [...out.values()];
}

/** paragraphs of one language, since the rules name it */
function nextBatch(pending: Pending[]): Pending[] {
	const language = pending[0].target.language;
	const batch: Pending[] = [];
	let chars = 0;
	for (let i = 0; i < pending.length && batch.length < BATCH_PARAGRAPHS;) {
		const p = pending[i];
		if (p.target.language !== language) {
			i++;
			continue;
		}
		if (batch.length && chars + p.target.linted.length > BATCH_CHARS) break;
		chars += p.target.linted.length;
		batch.push(...pending.splice(i, 1));
	}
	return batch;
}

/** asked paragraphs already reviewed or just failed drop out */
function pendingAsked(now: number, taken: ReadonlySet<string>): Pending[] {
	for (let i = asked.length - 1; i >= 0; i--)
		if (!sending.has(asked[i].key) && !wanted(asked[i].target, asked[i].key, now)) asked.splice(i, 1);
	noteAsked();
	return asked.filter((p) => !taken.has(p.key) && !sending.has(p.key));
}

/** queues the paragraphs behind what is on screen; the number queued */
export function reviewParagraphs(targets: ReviewTarget[]): number {
	const now = Date.now();
	const queued = new Set(asked.map((p) => p.key));
	reviewsAskedError.current = null;
	pausedUntil = 0;
	for (const target of targets) {
		const key = reviewKey(target);
		failedAt.delete(key);
		if (queued.has(key) || !wanted(target, key, now)) continue;
		queued.add(key);
		asked.push({ target, key, source: ASKED_SOURCE });
		reviewsAskedTotal.current++;
	}
	noteAsked();
	reviewSoon(0);
	return asked.length;
}

/** Stop: what is asked and not yet sent stays unsent */
export function stopAskedReviews(): void {
	asked.length = 0;
	noteAsked();
}

function sendVisible(): void {
	timer = null;
	if (!proofreadOn()) return;
	if (Date.now() < pausedUntil) {
		timer = setTimeout(sendVisible, pausedUntil - Date.now());
		return;
	}
	// the agent is one program, run a request at a time
	const onScreen = pendingOnScreen();
	const pending = [...onScreen, ...pendingAsked(Date.now(), new Set(onScreen.map((p) => p.key)))];
	if (inFlight === 0 && pending.length) void send(nextBatch(pending));
}

const NO_CHANGE: ParagraphReview = { verdicts: new Map(), own: [] };

async function send(batch: Pending[]): Promise<void> {
	const bridge = proofreadBridge();
	if (!bridge) return;
	inFlight++;
	for (const p of batch) sending.add(p.key);
	try {
		const answer = await bridge
			.review(reviewSystem(batch[0].target.language), reviewRequest(batch.map((p) => p.target)))
			.catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
		const parsed = answer.ok ? parseReview(answer.text) : null;
		if (!parsed) {
			const now = Date.now();
			for (const p of batch) failedAt.set(p.key, now);
			pausedUntil = now + AFTER_FAILURE_MS;
			const error = answer.ok ? 'The answer was not the JSON asked for.' : answer.error;
			noteProofreadResult(error);
			// an asked run stops at its first failure and says why
			if (asked.length) {
				reviewsAskedError.current = error;
				stopAskedReviews();
			}
			return;
		}
		noteProofreadResult(null);
		const landed = new Map<ReviewSource, Set<string>>();
		batch.forEach((p, id) => {
			keepReview(p.key, parsed.get(id) ?? NO_CHANGE);
			if (!landed.has(p.source)) landed.set(p.source, new Set());
			landed.get(p.source)!.add(p.target.linted);
		});
		for (const [source, linted] of landed) if (sources.has(source)) source.redraw(linted);
		void addRecognizedTerms(batch.map((p, id) => ({ target: p.target, review: parsed.get(id) ?? NO_CHANGE })));
	} finally {
		inFlight--;
		for (const p of batch) sending.delete(p.key);
		pendingAsked(Date.now(), new Set());
		reviewSoon(0);
	}
}

let wasOn: boolean | null = null;
// turned on or off: what is drawn is out of date in every editor
observe(proofreadOn, (on) => {
	if (wasOn !== null && on !== wasOn) markLintsStale();
	wasOn = on;
	if (on) reviewSoon(0);
});
