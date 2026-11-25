// mode-switch scroll + cursor sync (visual/source, every structured dialect): both directions
// carry two anchors as file offsets through the source map. scroll = the viewport-top block,
// cursor = the caret
import { TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import type { SourceMap } from './sourceSpans';
import { blockAtOrBefore, blockAtPm, offsetAtPm, pmAtOffset } from './sourceMap';
import { flashNodeAt } from './extensions/flash-plugin';

export type VisualAnchor = {
	scroll: number | null;
	cursor: number | null;
};
export type SourceAnchor = {
	scroll: number;
	cursor: number | null;
	/** a history step: caret into view, no flash, no viewport re-anchor */
	caretOnly?: boolean;
};

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur) {
		const oy = getComputedStyle(cur).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
		cur = cur.parentElement;
	}
	return null;
}

/**
 * Leaving visual mode: the viewport-top block's offset (scroll) plus the caret's (cursor).
 */
export function captureVisualAnchor(map: SourceMap): VisualAnchor | null {
	const v = editorViewStore.current;
	if (!v) return null;
	const scRect = findScrollParent(v.dom)?.getBoundingClientRect();
	const scTop = (scRect?.top ?? 0) + 4;

	// scroll anchor: the topmost visible block, searched by halves because each block asked is laid out
	function bottomOf(i: number): number | null {
		return v!.canvas.nodeClientRect(map.blocks[i].pmFrom)?.rect.bottom ?? null;
	}
	let low = 0;
	let high = map.blocks.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		let at = mid;
		let bottom = bottomOf(at);
		while (bottom === null && at + 1 < high) bottom = bottomOf(++at);
		if (bottom !== null && bottom > scTop) high = mid;
		else low = at + 1;
	}
	let scroll: number | null = null;
	for (let i = low; i < map.blocks.length && scroll === null; i++) {
		const bottom = bottomOf(i);
		if (bottom !== null && bottom > scTop) scroll = map.blocks[i].srcFrom;
	}

	// cursor anchor: the caret, wherever it is. The source editor keeps the reading position when
	// the caret falls inside the viewport from there, and brings the caret into view otherwise
	const head = v.state.selection.head;
	const cursor = blockAtPm(map, head) ? offsetAtPm(map, head) : null;

	return scroll == null && cursor == null ? null : { scroll, cursor };
}

/** leaving source mode: viewport-top texSource offset (scroll) + the CM caret offset (cursor). */
export function captureSourceAnchor(): SourceAnchor | null {
	const cm = sourceCmView.current;
	if (!cm) return null;
	const rect = cm.scrollDOM.getBoundingClientRect();
	return {
		scroll: cm.posAtCoords({ x: rect.left + 10, y: rect.top + 10 }, false),
		cursor: cm.state.selection.main.head
	};
}

/** after a whole-buffer swap in source mode: the value-sync effect has replaced the doc by the
 *  next frame, so the offset can only be clamped and applied once it exists */
export function placeSourceCaret(offset: number): void {
	requestAnimationFrame(() => {
		const cm = sourceCmView.current;
		if (!cm) return;
		const pos = Math.max(0, Math.min(offset, cm.state.doc.length));
		cm.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
	});
}

/**
 * The caret for a place the source editor could stand in: a gap between two blocks that hold no
 * text of their own (two displays, a figure against a display) has no text position, and
 * TextSelection.near would dive into the formula or take the whole block, where the next keystroke
 * replaces it. That gap is what a gap cursor is for.
 */
function caretAt($pos: ResolvedPos) {
	// the gap cursor plugin's own test for the position, which its types do not declare
	const valid = (GapCursor as unknown as { valid($p: ResolvedPos): boolean }).valid;
	if (valid($pos)) return new GapCursor($pos);
	// an offset in the gap resolves to the first position INSIDE the block after it, which for a
	// display means the formula rather than the space before it
	if ($pos.parentOffset === 0 && $pos.depth > 0 && $pos.parent.type.spec.atom) {
		const $before = $pos.doc.resolve($pos.before($pos.depth));
		if (valid($before)) return new GapCursor($before);
	}
	return TextSelection.near($pos);
}

/** whether the caret at `pos` sits inside the visual editor's viewport */
function caretVisible(v: EditorView, pos: number): boolean {
	try {
		const c = v.coordsAtPos(pos);
		const r = findScrollParent(v.dom)?.getBoundingClientRect();
		if (!r || r.height === 0) return true;
		return c.top >= r.top && c.bottom <= r.bottom;
	} catch {
		return true;
	}
}

/**
 * Entering visual mode: restore the reading position and caret from a source anchor. Double rAF:
 * EditorView's doc-swap effect restores its saved scrollTop in a single rAF registered in this
 * same flush; ours must land after it or the anchor scroll gets overwritten.
 */
export function resolveVisualAnchor(v: EditorView & { isDestroyed?: boolean }, anchor: SourceAnchor, map: SourceMap): void {
	// the rows show once at the anchor's place, never first at the place the editor was left at
	const { promise, resolve: placed } = Promise.withResolvers<void>();
	if (!anchor.caretOnly) v.canvas.holdWhilePlacing(promise);
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			try {
				if (v.isDestroyed) return; // the view can be torn down between consume and resolve
				// an offset in the preamble, or past the end, still lands on a block: the switch must move
				const scrollHit = blockAtOrBefore(map, anchor.scroll);
				if (scrollHit && !anchor.caretOnly) {
					v.canvas.revealPos(scrollHit.pmFrom, 'start');
				}
				// caret: the source cursor's own position, falling back to the scroll block. The scroll
				// anchor owns the viewport while the caret lands inside it; a caret it leaves outside
				// (the source caret was below the viewport) is brought into view instead
				const caretPos = (anchor.cursor != null ? pmAtOffset(map, anchor.cursor) : null) ?? (scrollHit ? scrollHit.pmFrom + 1 : null);
				if (caretPos == null) return; // an empty doc: nothing to place a caret in at all
				const doc = v.state.doc;
				const at = Math.min(caretPos, doc.content.size);
				const tr = v.state.tr.setSelection(caretAt(doc.resolve(at))).setMeta('addToHistory', false);
				v.dispatch(anchor.caretOnly || !caretVisible(v, at) ? tr.scrollIntoView() : tr);
				// reclaim DOM focus for PM: the mount-time selection can sit inside a CM-backed
				// nodeview that focuses its inner CodeMirror; PM then never syncs the DOM caret
				// and the next keystrokes would land in that nodeview instead of at the parked caret
				v.focus();
				// flash the caret's block, same amber as the SyncTeX flash. a node decoration
				// (flash-plugin) because a bare classList.add doesn't survive PM redraws.
				if (anchor.caretOnly) return;
				const flashBlock = blockAtPm(map, caretPos);
				if (flashBlock) flashNodeAt(v, flashBlock.pmFrom);
			} catch {
				/* best-effort; never break the mode switch over a scroll */
			} finally {
				placed();
			}
		})
	);
}
