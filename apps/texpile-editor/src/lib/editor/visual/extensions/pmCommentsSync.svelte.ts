// The reactive half of pmComments, shared by every visual editor (latex, markdown, typst): keep
// the plugin's ranges in step with the thread list and the document, and the focused thread in
// step with the panel selection. One implementation, because the guards are the subtle part and
// three hand-copied versions of them would drift.
//
// Runs $effects, so it must be called during component init.
import type { EditorView } from 'prosemirror-view';
import type { RegionParser, SourceMap } from '../sourceSpans';
import type { CommentRange } from './comments';
import { setPmComments, focusPmComment, placePmComments, setPmCommentPending, pmCommentsKey } from './pmComments';
import { pmSuggestionsKey, setPmSuggestions } from './pmSuggestions';
import { placePmSuggestions } from './pmSuggestionsPlace';
import { activeSuggestions, suggestionVisibility, type SuggestionMark } from '$lib/comments/activeSuggestions.svelte';

const PLACE_MS = 150;

export type PmCommentsSyncArgs = {
	/** the mounted view, or null until it exists */
	view: () => EditorView | null;
	/** the file's threads as ranges of its text, resolved by the controller */
	ranges: () => CommentRange[];
	/** the file's text, and where the document's runs sit in it */
	text: () => string;
	map: () => SourceMap;
	/** the stretch of the text the document is */
	body: () => { from: number; to: number };
	/** parses a stretch of the text as the file was parsed; null when this file has no parser */
	parse: () => RegionParser | null;
	/**
	 * Bumped by the caller when a re-parsed doc is SWAPPED onto the view (updateState rebuilds
	 * plugin state, dropping the old ranges). Typing must not bump it: ranges map through
	 * transactions, and looking them up mid-edit would read a map of text the editor is ahead of.
	 */
	epoch: () => number;
	/** bumped when a collaborator's change is patched in: marks that came with it were placed on the text before it */
	patched?: () => number;
	selected: () => string | null;
	/** the focused editor's: the suggestion marks are its file's, and so is what the panel says of them */
	live: () => boolean;
	/** the threads that could not be drawn in this view, for the panel's "not in this view" */
	onPlaced?: (lost: string[]) => void;
	/**
	 * A comment composer is open. The editor SETS its pending tint at the gesture (the pill or
	 * context menu know the exact selection); this only clears it when the composer closes -
	 * committed, cancelled, or abandoned by a file switch.
	 */
	pendingActive?: () => boolean;
};

export function syncPmComments(args: PmCommentsSyncArgs): void {
	// Re-place threads when the list changes or a swap lands. Between those the plugin maps its
	// ranges through every transaction, which is exact, so a thread already placed keeps that
	// range: only a new one, or one the controller resolved afresh, is looked up in the map. The
	// fingerprint guard matters because the ranges array usually arrives through an object literal
	// rebuilt on every parent render.
	let lastFp = '';
	let lastEpoch = -1;
	let lastById = new Map<string, string>();
	$effect(() => {
		const v = args.view();
		const ranges = args.ranges();
		const epoch = args.epoch();
		if (!v) return;
		const byId = new Map(ranges.map((r) => [r.id, `${r.resolved ? 1 : 0}:${r.from}-${r.to}`]));
		const fp = [...byId].map(([id, k]) => `${id}:${k}`).join('|');
		if (fp === lastFp && epoch === lastEpoch) return;
		const swapped = epoch !== lastEpoch;
		lastFp = fp;
		lastEpoch = epoch;
		const held = new Map((pmCommentsKey.getState(v.state)?.ranges ?? []).map((r) => [r.id, r]));
		function keeps(r: CommentRange) {
			return !swapped && held.has(r.id) && lastById.get(r.id) === byId.get(r.id);
		}
		lastById = byId;
		const placed = placePmComments(
			v.state.doc,
			ranges.filter((r) => !keeps(r)),
			args.map()
		);
		const kept = ranges.filter(keeps).map((r) => ({ ...held.get(r.id)!, resolved: r.resolved }));
		setPmComments(v, [...kept, ...placed.ranges]);
		args.onPlaced?.(placed.lost);
	});

	let lastMarks: SuggestionMark[] | null = null;
	let lastMarksEpoch = -1;
	let lastPatched = -1;
	let placedAt = 0;
	let later: ReturnType<typeof setTimeout> | null = null;
	function placeSuggestions(v: EditorView, marks: SuggestionMark[]) {
		if (later) clearTimeout(later);
		later = null;
		lastMarks = marks;
		placedAt = performance.now();
		const parse = args.parse();
		if (!parse) {
			setPmSuggestions(v, []);
			suggestionVisibility.current = { partial: new Set(), hidden: new Set(marks.map((m) => m.id)) };
			return;
		}
		const placed = placePmSuggestions(v.state.doc, marks, { text: args.text(), map: args.map(), body: args.body(), parse });
		// a mark of a text the editor has moved past keeps its last placement, mapped through the
		// edits since; the comparison that follows the edit places it afresh
		const held = (pmSuggestionsKey.getState(v.state)?.ranges ?? []).filter((r) => placed.stale.has(r.id));
		setPmSuggestions(v, [...held, ...placed.ranges]);
		suggestionVisibility.current = { partial: placed.partial, hidden: placed.hidden };
	}
	$effect(() => {
		const v = args.view();
		if (!args.live()) return;
		const marks = activeSuggestions.current;
		const epoch = args.epoch();
		const patched = args.patched?.() ?? 0;
		if (!v || (marks === lastMarks && epoch === lastMarksEpoch && patched === lastPatched)) return;
		const swapped = epoch !== lastMarksEpoch || patched !== lastPatched;
		lastMarksEpoch = epoch;
		lastPatched = patched;
		const wait = placedAt + PLACE_MS - performance.now();
		if (swapped || wait <= 0) return placeSuggestions(v, marks);
		const doc = v.state.doc;
		if (later) clearTimeout(later);
		later = setTimeout(() => (v.state.doc === doc ? placeSuggestions(v, marks) : (later = null)), wait);
	});
	$effect(() => {
		if (!args.live()) return;
		return () => {
			if (later) clearTimeout(later);
			lastMarks = null;
			suggestionVisibility.current = { partial: new Set(), hidden: new Set() };
		};
	});

	$effect(() => {
		const v = args.view();
		const active = args.pendingActive?.() ?? false;
		if (!v || active) return;
		setPmCommentPending(v, null);
	});

	// Declared AFTER the placement effect on purpose: effects run in declaration order, so the ranges
	// are already in plugin state when this reveals one.
	let lastFocused: string | null | undefined;
	$effect(() => {
		const v = args.view();
		const id = args.selected();
		if (!v || id === lastFocused) return;
		lastFocused = id;
		focusPmComment(v, id);
	});
}
