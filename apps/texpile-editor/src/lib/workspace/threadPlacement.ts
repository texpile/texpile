// where each comment thread sits in its file's text
import { buildAnchor, resolveAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { MIN_QUOTE, POINT_WEAK, searchContext, searchQuote } from '$lib/comments/anchorSearch';
import type { CommentThread } from '$lib/comments/log';
import { isSuggestion } from '$lib/comments/suggest';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';
import { mapEnd, mapStart, type TextEdit } from './edits/textEdits';

/** `known` is set only when this pass changed it */
export type ThreadPlacement = {
	ranges: CommentRange[];
	lost: Set<string>;
	weak: Set<string>;
	known: Map<string, CommentAnchor> | null;
};

/** `lastWords` is updated in place */
export function placeThreads(
	threads: CommentThread[],
	text: string,
	exact: (id: string) => CommentAnchor | null,
	knownBefore: Map<string, CommentAnchor>,
	lastWords: Map<string, CommentAnchor>
): ThreadPlacement {
	const ranges: CommentRange[] = [];
	const lost = new Set<string>();
	const weak = new Set<string>();
	const known = new Map(knownBefore);
	let knownChanged = false;
	for (const t of threads) {
		if (isSuggestion(t)) continue;
		const given = exact(t.id);
		if (given) {
			const words = wordsBack(t, given, text, lastWords);
			ranges.push({ id: t.id, from: words.start, to: words.end, resolved: t.resolved });
			const had = known.get(t.id);
			if (!had || !sameAnchor(had, words)) {
				known.set(t.id, words);
				knownChanged = true;
			}
			continue;
		}
		const prior = known.get(t.id);
		if (!(prior ?? t.anchor).quote) {
			const back = revive(t, text, (prior ?? t.anchor).start, lastWords);
			if (back) {
				ranges.push({ id: t.id, from: back.start, to: back.end, resolved: t.resolved });
				known.set(t.id, back);
				knownChanged = true;
			}
			continue;
		}
		let hit = null;
		for (const a of prior ? [prior, t.anchor] : [t.anchor]) {
			hit = resolveAnchor(text, a);
			if (hit) break;
		}
		if (hit) {
			ranges.push({ id: t.id, from: hit.from, to: hit.to, resolved: t.resolved });
			if (hit.weak) weak.add(t.id);
			lastWords.set(t.id, buildAnchor(text, hit.from, hit.to));
		} else lost.add(t.id);
	}
	return { ranges, lost, weak, known: knownChanged ? known : null };
}

export function withAnchors(threads: CommentThread[], known: Map<string, CommentAnchor>): CommentThread[] {
	if (known.size === 0) return threads;
	return threads.map((t) => {
		const a = known.get(t.id);
		return a && a !== t.anchor ? { ...t, anchor: a } : t;
	});
}

export function driftedAnchors(
	threads: CommentThread[],
	text: string,
	live: Map<string, CommentAnchor>
): { id: string; anchor: CommentAnchor }[] {
	const moved: { id: string; anchor: CommentAnchor }[] = [];
	for (const t of threads) {
		const anchor = live.get(t.id);
		if (!anchor || t.resolved || isSuggestion(t)) continue;
		const hit = resolveAnchor(text, t.anchor);
		if (hit && !hit.weak && hit.from === anchor.start && hit.to === anchor.end) continue;
		moved.push({ id: t.id, anchor });
	}
	return moved;
}

/** comments on a file with no editor, carried through `edits`; only those whose anchor would no longer find them */
export function carriedAnchors(
	threads: CommentThread[],
	before: string,
	after: string,
	edits: readonly TextEdit[]
): { id: string; anchor: CommentAnchor }[] {
	const live = new Map<string, CommentAnchor>();
	for (const t of threads) {
		if (t.resolved || isSuggestion(t)) continue;
		const hit = resolveAnchor(before, t.anchor);
		if (!hit) continue;
		const from = mapStart(hit.from, edits);
		const to = mapEnd(hit.to, edits);
		if (to > from) live.set(t.id, buildAnchor(after, from, to));
	}
	return driftedAnchors(threads, after, live);
}

function wordsBack(t: CommentThread, exact: CommentAnchor, text: string, lastWords: Map<string, CommentAnchor>): CommentAnchor {
	if (exact.quote) {
		lastWords.set(t.id, exact);
		return exact;
	}
	return revive(t, text, exact.start, lastWords) ?? exact;
}

function revive(t: CommentThread, text: string, hint: number, lastWords: Map<string, CommentAnchor>): CommentAnchor | null {
	const words = lastWords.get(t.id) ?? (t.anchor.quote ? t.anchor : null);
	if (!words) return null;
	const hit =
		words.quote.length < MIN_QUOTE
			? searchContext(text, words.quote, words.prefix, words.suffix, hint)
			: searchQuote(text, words.quote, words.prefix, words.suffix, hint);
	if (!hit || hit.context < Math.min(POINT_WEAK, words.prefix.length + words.suffix.length)) return null;
	return buildAnchor(text, hit.from, hit.to);
}

function sameAnchor(a: CommentAnchor, b: CommentAnchor): boolean {
	return a.start === b.start && a.end === b.end && a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;
}
