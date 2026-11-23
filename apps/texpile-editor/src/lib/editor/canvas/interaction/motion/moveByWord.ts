// word moves from the head (a range moves from its head too); a textblock edge steps to the next textblock's facing edge
import { TextSelection } from 'prosemirror-state';
import { PLATFORM_RULES, type Platform } from '$lib/editor/keys/platformKeys';
import type { CaretPlace, VisualWordStart } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { contentEdge, facingEdgeBeyond, textblockAround, type HeldTextblock } from './caretTextblocks';
import { logicalDir } from '../../caret/caretMoves';
import { caretPolicyOf } from '../../geometry/caretPolicy';

/** `to` stands further the way the key goes than `from`: a later line, or further along the same one */
function advances(view: VisualView, from: CaretPlace, to: CaretPlace, visualDir: -1 | 1): boolean {
	const { geometry } = view.canvas;
	const [lineFrom, lineTo] = [geometry.lineOf(from), geometry.lineOf(to)];
	const [rectFrom, rectTo] = [geometry.caretRect(from), geometry.caretRect(to)];
	if (!lineFrom || !lineTo || !rectFrom || !rectTo) return true;
	if (lineFrom.top !== lineTo.top) return (lineTo.top - lineFrom.top) * visualDir > 0;
	return (rectTo.x - rectFrom.x) * visualDir > 0;
}

/** the word move on a line holding right-to-left text, read in the direction of the run the key goes into */
function visualWordTarget(
	view: VisualView,
	textblock: HeldTextblock,
	start: VisualWordStart,
	visualDir: -1 | 1,
	word: WordMove
): CaretPlace | null {
	const head = view.canvas.head();
	if (start.kind === 'leaf') return start.past;
	if (start.kind === 'from' && start.place.pos !== contentEdge(textblock, start.dir)) {
		const rule = start.dir < 0 ? 'previousStart' : PLATFORM_RULES[word.platform].wordRightStopsAt;
		// the caret stays with the run it read through
		const target: CaretPlace = { pos: view.canvas.geometry.wordBoundary(start.place, start.dir, rule), affinity: start.dir > 0 ? -1 : 1 };
		if (advances(view, head, target, visualDir)) return target;
	}
	// a word read in text order can lie behind the key (a break space hangs past the end of a right-to-left line)
	const step = view.canvas.geometry.visualStep(head, visualDir);
	if (step?.kind === 'place') return step.place;
	if (step?.kind === 'leaf') return step.past;
	const beyond = facingEdgeBeyond(view, textblock, step?.dir ?? start.dir, word.extend);
	return beyond === null ? null : { pos: beyond, affinity: 1 };
}

type WordMove = { readonly platform: Platform; readonly extend: boolean };

export function wordTarget(view: VisualView, visualDir: -1 | 1, platform: Platform, extend: boolean): CaretPlace | null {
	const { selection } = view.state;
	if (!(selection instanceof TextSelection)) return null;
	const textblock = textblockAround(selection.$head);
	if (!textblock) return null;
	const visual = view.canvas.geometry.visualWordStart(view.canvas.head(), visualDir);
	if (visual) return visualWordTarget(view, textblock, visual, visualDir, { platform, extend });
	const dir = logicalDir(view, visualDir);
	const { head } = selection;
	if (head === contentEdge(textblock, dir)) {
		const beyond = facingEdgeBeyond(view, textblock, dir, extend);
		return beyond === null ? null : { pos: beyond, affinity: 1 };
	}
	// a chip beside the caret is one word, as LyX takes an inset
	const beside = extend ? null : dir > 0 ? selection.$head.nodeAfter : selection.$head.nodeBefore;
	const policy = beside && !beside.isText ? caretPolicyOf(view, beside) : null;
	if (beside && policy && policy !== 'text' && policy !== 'island') return { pos: head + dir * beside.nodeSize, affinity: 1 };
	const rule = dir < 0 ? 'previousStart' : PLATFORM_RULES[platform].wordRightStopsAt;
	return { pos: view.canvas.geometry.wordBoundary(view.canvas.head(), dir, rule), affinity: 1 };
}
