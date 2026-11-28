// A paragraph's review read off the model's rewrite of its sentences: every change a suggestion, Harper's findings on
// words it kept dropped
import { SPELLING_RULE } from '../../config/grammarRules';
import type { SentenceAsked } from '../reviewPrompt';
import type { HarperVerdict, OwnFinding, ParagraphReview, ReviewReading, ReviewTarget } from '../reviewTypes';
import { changeKind, changeRule } from './changeTitles';
import { changedShare, sentenceChanges, type RewriteChange } from './rewriteDiff';

// a paragraph rewritten past this share of its words is the model going its own way
const MOST_CHANGED = 0.5;

type Span = { offset: number; length: number };

function overlaps(a: Span, b: Span): boolean {
	return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

function inside(inner: Span, outer: Span): boolean {
	return inner.offset >= outer.offset && inner.offset + inner.length <= outer.offset + outer.length;
}

/** `sentences` are the paragraph's own, in order; `rewrites` the answer by id */
export function reviewFromRewrite(
	target: ReviewTarget,
	reading: ReviewReading,
	sentences: readonly SentenceAsked[],
	rewrites: ReadonlyMap<string, string>
): ParagraphReview {
	const answered = sentences.filter((s) => rewrites.has(s.id));
	const changes: RewriteChange[] = [];
	for (const s of answered) {
		const source = reading.text.slice(s.from, s.to);
		for (const c of sentenceChanges(source, rewrites.get(s.id)!, target.language))
			changes.push({ ...c, from: s.from + c.from, to: s.from + c.to });
	}
	if (changedShare(reading.text, changes, target.language) > MOST_CHANGED) return { verdicts: new Map(), own: [] };

	function linted(from: number, to: number): Span {
		return reading.toLinted(from, to - from);
	}
	const changedSpans = changes.map((c) => linted(c.from, c.to));
	const answeredSpans = answered.map((s) => linted(s.from, s.to));
	const verdicts = new Map<number, HarperVerdict>();
	target.matches.forEach((match, id) => {
		if (!answeredSpans.some((span) => inside(match, span))) return;
		const changed = changedSpans.some((span) => overlaps(match, span));
		verdicts.set(id, { verdict: !changed && match.rule === SPELLING_RULE ? 'term' : 'drop' });
	});

	const own: OwnFinding[] = changes.map((c, i) => {
		const quote = reading.text.slice(c.from, c.to);
		// Harper's words only title a change of the same words
		const harper = target.matches.find((match) => match.offset === changedSpans[i].offset && match.length === changedSpans[i].length);
		const kind = harper?.rule === SPELLING_RULE && !c.whole ? 'spelling' : changeKind(quote, c.replacement, c.whole);
		return { quote, replacement: c.replacement, at: c.from, kind: changeRule(kind), change: kind, reason: harper?.message ?? '' };
	});
	return { verdicts, own };
}
