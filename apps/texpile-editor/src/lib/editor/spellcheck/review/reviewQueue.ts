// When paragraphs go to the model: the ones on screen, once the writer has paused, a few at a time
import { settings } from '$lib/settings';
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

function sendVisible(): void {
	timer = null;
	if (!proofreadOn() || Date.now() < pausedUntil) return;
	// the agent is one program run at a time
	const most = settings.current.refineAgents?.[0] === 'service' ? 2 : 1;
	const pending = pendingOnScreen();
	while (inFlight < most && pending.length) void send(nextBatch(pending));
}

const NO_CHANGE: ParagraphReview = { verdicts: new Map(), own: [] };

async function send(batch: Pending[]): Promise<void> {
	const bridge = proofreadBridge();
	if (!bridge) return;
	inFlight++;
	for (const p of batch) sending.add(p.key);
	try {
		const answer = await bridge.review(reviewSystem(batch[0].target.language), reviewRequest(batch.map((p) => p.target)));
		const parsed = answer.ok ? parseReview(answer.text) : null;
		if (!parsed) {
			const now = Date.now();
			for (const p of batch) failedAt.set(p.key, now);
			pausedUntil = now + AFTER_FAILURE_MS;
			noteProofreadResult(answer.ok ? 'The answer was not the JSON asked for.' : answer.error);
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
