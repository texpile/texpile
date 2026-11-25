// A paragraph's review kept through a small edit, such as an accepted suggestion, until the model has read the new text
import type { LintMatch } from '../linter';
import type { HarperVerdict, ParagraphReview } from './reviewTypes';

// a change past this on either side is a new paragraph to the model
const MOST_CHANGED = 200;

export type ReviewedText = { context: string; linted: string; matches: LintMatch[]; review: ParagraphReview };

/** the one span that changed: [from, oldTo) in the text before, [from, newTo) in the text after */
export type TextEdit = { from: number; oldTo: number; newTo: number; shared: number };

export function editBetween(before: string, after: string): TextEdit | null {
	const most = Math.min(before.length, after.length);
	let from = 0;
	while (from < most && before.charCodeAt(from) === after.charCodeAt(from)) from++;
	let end = 0;
	while (end < most - from && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
	const oldTo = before.length - end;
	const newTo = after.length - end;
	const changed = Math.max(oldTo - from, newTo - from);
	const shared = from + end;
	return changed > MOST_CHANGED || shared < changed ? null : { from, oldTo, newTo, shared };
}

/** the reviewed text this one is a small edit of, the closest first */
export function closestReviewed(
	reviewed: Iterable<ReviewedText>,
	context: string,
	linted: string
): { from: ReviewedText; edit: TextEdit } | null {
	let best: { from: ReviewedText; edit: TextEdit } | null = null;
	for (const from of reviewed) {
		if (from.context !== context) continue;
		const edit = editBetween(from.linted, linted);
		if (edit && (!best || edit.shared > best.edit.shared)) best = { from, edit };
	}
	return best;
}

function shiftedOffset(match: LintMatch, edit: TextEdit): number | null {
	if (match.offset + match.length <= edit.from) return match.offset;
	if (match.offset >= edit.oldTo) return match.offset + edit.newTo - edit.oldTo;
	return null;
}

/** verdicts follow their findings past the edit; the model's own findings are found again by their quotes */
export function carriedReview(from: ReviewedText, matches: LintMatch[], edit: TextEdit): ParagraphReview {
	const verdicts = new Map<number, HarperVerdict>();
	from.matches.forEach((match, id) => {
		const said = from.review.verdicts.get(id);
		const at = said ? shiftedOffset(match, edit) : null;
		if (!said || at === null) return;
		const now = matches.findIndex((m) => m.rule === match.rule && m.offset === at && m.length === match.length);
		if (now >= 0) verdicts.set(now, said);
	});
	return { verdicts, own: from.review.own };
}
