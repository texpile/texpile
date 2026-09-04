// The reactive half of pmComments, shared by every visual editor (latex, markdown, typst): keep
// the plugin's ranges in step with the thread list and the document, and the focused thread in
// step with the panel selection. One implementation, because the guards are the subtle part and
// three hand-copied versions of them would drift.
//
// Runs $effects, so it must be called during component init.
import type { EditorView } from 'prosemirror-view';
import type { CommentThread } from '$lib/comments/log';
import type { AnchorDialect } from '$lib/comments/anchor';
import { setPmComments, focusPmComment, resolvePmComments, revealPmComment, setPmCommentPending } from './pmComments';

export type PmCommentsSyncArgs = {
	/** the mounted view, or null until it exists */
	view: () => EditorView | null;
	threads: () => CommentThread[];
	/** the source dialect anchors are matched against; static per editor */
	dialect: AnchorDialect;
	/**
	 * Bumped by the caller when a re-parsed doc is SWAPPED onto the view (updateState rebuilds
	 * plugin state, dropping the old ranges). Typing must not bump it: ranges map through
	 * transactions, and re-searching mid-edit could snap a range onto another copy of its text.
	 */
	epoch: () => number;
	selected: () => string | null;
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
	// Re-place threads when the list changes or a swap lands. The fingerprint guard matters
	// because the threads array usually arrives through an object literal rebuilt on every parent
	// render - identity alone would re-resolve (a full flatten + search per thread) on every
	// unrelated state change. An anchor changes only by re-pinning (an `anchor` event), so id +
	// resolved + the anchor's own offsets are the whole of what the decorations depend on.
	let lastFp = '';
	let lastEpoch = -1;
	$effect(() => {
		const v = args.view();
		const threads = args.threads();
		const epoch = args.epoch();
		if (!v) return;
		const fp = threads.map((t) => `${t.id}:${t.resolved ? 1 : 0}:${t.anchor.start}-${t.anchor.end}`).join('|');
		if (fp === lastFp && epoch === lastEpoch) return;
		lastFp = fp;
		lastEpoch = epoch;
		const placed = resolvePmComments(v.state.doc, threads, args.dialect);
		setPmComments(v, placed.ranges);
		args.onPlaced?.(placed.lost);
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
		// Scroll to it as well as tint it. This is what carries a CROSS-FILE jump: the controller tries
		// to reveal at the moment of the click, when this file's view has not mounted yet, so the only
		// place that can finish the job is here - the first run after the new view exists and has
		// placed its threads. Keyed on the selection CHANGING, never on re-placement, or a background
		// re-parse would yank the viewport to whatever thread happened to be selected.
		if (id) revealPmComment(v, id);
	});
}
