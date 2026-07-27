// mode-switch scroll + cursor sync (visual/source, .tex only): both directions carry two anchors
// as texSource offsets, resolved positionally via the parse-time orig.start stamps (content
// matching fails wholesale against an edited buffer; positions only drift). scroll = the
// viewport-top block, cursor = the caret mapped proportionally within its block's orig.latex slice.
import { get } from 'svelte/store';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { buildBlockMap, blockAtPm, blockAtSource, sourceStartAt, pmPosToSourceOffset, sourceOffsetToPmPos } from './sourceMap';
import { flashNodeAt } from './extensions/flash-plugin';

export interface VisualAnchor {
	scroll: number | null;
	cursor: number | null;
}
export interface SourceAnchor {
	scroll: number;
	cursor: number | null;
}

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
 * Leaving visual mode: viewport-top block offset (scroll) plus the PM caret's source offset
 * (cursor), the exact inverse of the source-to-visual mapping. An off-screen caret is ignored:
 * flashing a line the user wasn't looking at would read as a wrong jump.
 * `bodyOffset` is where the body begins in the FILE (orig.start stamps are body-relative).
 */
export function captureVisualAnchor(bodyOffset: number): VisualAnchor | null {
	const v = get(editorViewStore);
	if (!v) return null;
	const doc = v.state.doc;
	const map = buildBlockMap(doc, bodyOffset);
	const scRect = findScrollParent(v.dom)?.getBoundingClientRect();
	const scTop = (scRect?.top ?? 0) + 4;
	const scBottom = scRect?.bottom ?? Number.POSITIVE_INFINITY;

	// scroll anchor: the topmost visible block
	let scroll: number | null = null;
	for (const b of map) {
		const dom = v.nodeDOM(b.pmPos);
		if (dom instanceof HTMLElement && dom.getBoundingClientRect().bottom > scTop) {
			scroll = sourceStartAt(map, b.index);
			break;
		}
	}

	// cursor anchor: only when the caret's block is on-screen (an off-screen caret must not
	// yank the incoming view away from the reading position)
	let cursor: number | null = null;
	const head = v.state.selection.head;
	const cb = blockAtPm(map, head);
	if (cb) {
		const dom = v.nodeDOM(cb.pmPos);
		const r = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
		if (r && r.bottom > scTop && r.top < scBottom) {
			cursor = pmPosToSourceOffset(doc, map, head) ?? sourceStartAt(map, cb.index);
		}
	}

	return scroll == null && cursor == null ? null : { scroll, cursor };
}

/** leaving source mode: viewport-top texSource offset (scroll) + the CM caret offset (cursor). */
export function captureSourceAnchor(): SourceAnchor | null {
	const cm = get(sourceCmView);
	if (!cm) return null;
	const rect = cm.scrollDOM.getBoundingClientRect();
	return {
		scroll: cm.posAtCoords({ x: rect.left + 10, y: rect.top + 10 }, false),
		cursor: cm.state.selection.main.head
	};
}

/**
 * Entering visual mode: restore the reading position and caret from a source anchor. Double rAF:
 * EditorView's doc-swap effect restores its saved scrollTop in a single rAF registered in this
 * same flush; ours must land after it or the anchor scroll gets overwritten.
 */
export function resolveVisualAnchor(v: EditorView & { isDestroyed?: boolean }, anchor: SourceAnchor, bodyOffset: number): void {
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			try {
				if (v.isDestroyed) return; // the view can be torn down between consume and resolve
				const doc = v.state.doc; // live doc (includes normalization blocks, which carry no orig)
				const map = buildBlockMap(doc, bodyOffset);
				// scroll: restore the reading position (the block that topped the source viewport)
				const scrollHit = blockAtSource(map, anchor.scroll);
				if (scrollHit) {
					const dom = v.nodeDOM(scrollHit.pmPos);
					if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start' });
				}
				// caret: text-anchored inside the block containing the source cursor, falling back
				// to the scroll block. no scrollIntoView on the tr: the scroll anchor owns the viewport.
				const caretPos =
					(anchor.cursor != null ? sourceOffsetToPmPos(doc, map, anchor.cursor) : null) ?? (scrollHit ? scrollHit.pmPos + 1 : null);
				if (caretPos == null) return; // everything resolved into the preamble, stay at the top
				v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(caretPos))).setMeta('addToHistory', false));
				// reclaim DOM focus for PM: the mount-time selection can sit inside a CM-backed
				// nodeview that focuses its inner CodeMirror; PM then never syncs the DOM caret
				// and the next keystrokes would land in that nodeview instead of at the parked caret
				v.focus();
				// flash the caret's block, same amber as the SyncTeX flash. a node decoration
				// (flash-plugin) because a bare classList.add doesn't survive PM redraws.
				const flashBlock = blockAtPm(map, caretPos);
				if (flashBlock) flashNodeAt(v, flashBlock.pmPos);
			} catch {
				/* best-effort; never break the mode switch over a scroll */
			}
		})
	);
}
