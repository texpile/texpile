// When paragraphs go to the model: the ones on screen, once the writer has paused, a few at a time
import { box } from '$lib/runes/box.svelte';
import { observe } from '$lib/runes/observe.svelte';
import { proofreadBridge } from '$lib/ai/proofread/proofreadBridge';
import { noteProofreadResult } from '$lib/ai/proofread/proofreadStatus.svelte';
import { markLintsStale } from '../linter';
import { addRecognizedTerms } from './reviewTerms';
import { parseRewrite, rewriteRequest, reviewSystem } from './reviewPrompt';
import { reviewFromRewrite } from './rewrite/rewriteReview';
import { drawnCurrent, keepReview, proofreadOn, reviewKey, reviewOf } from './reviewStore';
import type { ReviewTarget } from './reviewTypes';

/** an editor's paragraphs on screen, and a way to draw some again once their review is in */
export type ReviewSource = { visible(): ReviewTarget[]; redraw(linted: ReadonlySet<string>): void };

// a paragraph is done changing once the writer stops for this long
const AFTER_EDIT_MS = 4000;
const AFTER_SCROLL_MS = 1500;
const AFTER_FAILURE_MS = 30_000;
const RETRY_AFTER_MS = 120_000;
// past about 400 words a request is no faster overall and each answer takes longer
const ASKED_WORDS = 400;
const ON_SCREEN_WORDS = 200;
// Proofread document runs this many requests at once, each to its own process where an agent needs one
const ASKED_LANES = 3;
const FEWEST_WORDS = 4;

/** twins: the same paragraph from another editor or the file, sent once and answered for each */
type Pending = { target: ReviewTarget; key: string; source: ReviewSource; twins?: Pending[] };

const sources = new Set<ReviewSource>();
const sending = new Set<string>();
const failedAt = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
// a big file lints block after block for minutes, and each lint asks again
const MOST_WAIT_MS = 10_000;
let waitingSince = 0;
const busyLanes = new Set<number>();
// an answer with no ids is asked once more before it counts as a failure
const askedAgain = new Set<string>();
// a batch that failed goes again a paragraph at a time, so one paragraph the model refuses fails alone
const sendAlone = new Set<string>();
// a failure or two is the paragraph's, which the model can refuse; three in a row are the agent's, and stop and say why
const MOST_FAILURES_IN_ROW = 3;
let failuresInRow = 0;
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
	const now = Date.now();
	if (timer) clearTimeout(timer);
	else waitingSince = now;
	timer = setTimeout(sendVisible, Math.max(0, Math.min(ms, waitingSince + MOST_WAIT_MS - now)));
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

function wordsOf(target: ReviewTarget): number {
	return target.linted.split(/\s+/).filter(Boolean).length;
}

/** whole paragraphs of one language, since the rules name it */
function nextBatch(pending: Pending[], most: number): Pending[] {
	const language = pending[0].target.language;
	const batch: Pending[] = [];
	if (sendAlone.has(pending[0].key)) return pending.splice(0, 1);
	let words = 0;
	for (let i = 0; i < pending.length;) {
		const p = pending[i];
		if (p.target.language !== language || sendAlone.has(p.key)) {
			i++;
			continue;
		}
		if (batch.length && words + wordsOf(p.target) > most) break;
		words += wordsOf(p.target);
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
	const onScreen = pendingOnScreen();
	const pending = joinTwins([...onScreen, ...pendingAsked(Date.now(), new Set(onScreen.map((p) => p.key)))]);
	const lanes = asked.length ? ASKED_LANES : 1;
	for (let lane = 0; lane < lanes && pending.length; lane++) {
		if (busyLanes.has(lane)) continue;
		const most = pending[0].source === ASKED_SOURCE ? ASKED_WORDS : ON_SCREEN_WORDS;
		void send(nextBatch(pending, most), lane);
	}
}

function joinTwins(pending: Pending[]): Pending[] {
	const first = new Map<string, Pending>();
	return pending.filter((p) => {
		const text = `${p.target.language}\0${p.target.linted.trim()}`;
		const same = first.get(text);
		if (same) same.twins!.push(p);
		else first.set(text, Object.assign(p, { twins: [] }));
		return !same;
	});
}

async function send(sent: Pending[], lane: number): Promise<void> {
	const bridge = proofreadBridge();
	if (!bridge) return;
	const batch = sent.flatMap((p) => [p, ...(p.twins ?? [])]);
	busyLanes.add(lane);
	for (const p of batch) sending.add(p.key);
	try {
		const request = rewriteRequest(sent.map((p) => p.target));
		const answer = await bridge
			.review(reviewSystem(batch[0].target.language), request.text, lane)
			.catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
		const rewrites = answer.ok ? parseRewrite(answer.text, request) : null;
		if (!rewrites && answer.ok && batch.some((p) => !askedAgain.has(p.key))) {
			for (const p of batch) askedAgain.add(p.key);
			return;
		}
		if (!rewrites && sent.length > 1) {
			for (const p of batch) sendAlone.add(p.key);
			return;
		}
		if (!rewrites) {
			const now = Date.now();
			for (const p of batch) failedAt.set(p.key, now);
			sendAlone.delete(batch[0].key);
			if (++failuresInRow < MOST_FAILURES_IN_ROW) return;
			pausedUntil = now + AFTER_FAILURE_MS;
			const error = answer.ok ? 'The answer did not keep the sentence ids.' : answer.error;
			noteProofreadResult(error);
			if (asked.length) {
				reviewsAskedError.current = error;
				stopAskedReviews();
			}
			return;
		}
		failuresInRow = 0;
		noteProofreadResult(null);
		const landed = new Map<ReviewSource, Set<string>>();
		const reviewed = sent.flatMap((first, id) => {
			const sentences = request.sentences.filter((s) => s.target === id);
			return [first, ...(first.twins ?? [])].map((p) => {
				const review = reviewFromRewrite(p.target, p.target.reading(), sentences, rewrites);
				askedAgain.delete(p.key);
				sendAlone.delete(p.key);
				keepReview(p.key, review);
				if (!landed.has(p.source)) landed.set(p.source, new Set());
				landed.get(p.source)!.add(p.target.linted);
				return { target: p.target, review };
			});
		});
		for (const [source, linted] of landed) if (sources.has(source)) source.redraw(linted);
		void addRecognizedTerms(reviewed);
	} finally {
		busyLanes.delete(lane);
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
