// Landing a re-parsed remote document in the live view: replace only the block ranges that
// changed, carry a caret inside it through the file, and hold the topmost visible line still so
// the patch never reads as a scroll jump.
import { TextSelection } from 'prosemirror-state';
import type { EditorView as PMEditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { type SourceMap } from '$lib/editor/visual/sourceSpans';
import { adoptParse, withBlockRuns, type ParseOrigins } from '$lib/editor/visual/parseOrigins';
import { caretAtOffset, offsetAtPm } from '$lib/editor/visual/sourceMap';
import { computeBlockPatches, protectCaretBlock, syncParseAttrs } from '$lib/editor/visual/blockPatch';
import { carriedOffset, patchAroundCaret } from './caretPatch';

// same walk as EditorView's doc-swap helper: the pane that actually scrolls the editor
function scrollParent(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur) {
		const oy = getComputedStyle(cur).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
		cur = cur.parentElement;
	}
	return null;
}

/** `oldMap` is the live doc's map of `oldSource`, `newMap` the parse's map of `newSource` and
 *  `origins` what that parse knew about its blocks */
export function applyRemotePatch(
	v: PMEditorView,
	parsedDoc: PMNode,
	oldMap: SourceMap,
	newMap: SourceMap,
	origins: ParseOrigins,
	oldSource: string,
	newSource: string
): void {
	const tr = v.state.tr;
	const head = v.state.selection.head;
	let srcOffset: number | null = null;
	const caret = patchAroundCaret(tr, parsedDoc, head, oldMap, newMap, oldSource, newSource);
	function adopt(doc: PMNode): void {
		const runs = caret?.runs;
		adoptParse(doc, runs ? withBlockRuns(origins, caret.index, doc.child(caret.index), runs) : origins);
	}
	if (caret) {
		syncParseAttrs(tr, parsedDoc);
		// words typed where the caret is go after it: the caret stays with what this side typed
		const sel = v.state.selection;
		if (sel instanceof TextSelection)
			tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(sel.anchor, -1), tr.mapping.map(sel.head, -1)));
	} else {
		// the block being typed in must not lose its in-progress tail to the re-parse: trailing
		// whitespace and still-empty paragraphs don't survive serialize->parse in any dialect
		const newDoc = protectCaretBlock(v.state.doc, parsedDoc, head);
		const patches = computeBlockPatches(v.state.doc, newDoc);
		// caret inside a replaced range: carry it through the file (outside it, PM maps it)
		if (patches.some((p) => head > p.from && head < p.to)) {
			const offset = offsetAtPm(oldMap, head);
			srcOffset = offset == null ? null : carriedOffset(v.state.doc, head, offset, oldMap, oldSource, newSource);
		}
		for (const p of [...patches].reverse()) tr.replaceWith(p.from, p.to, p.nodes);
		syncParseAttrs(tr, newDoc);
	}
	if (!tr.steps.length) {
		// the same content, perhaps from other bytes: the document is the parse's all the same
		adopt(v.state.doc);
		return;
	}
	tr.setMeta('addToHistory', false).setMeta('collabRemotePatch', true);
	if (srcOffset != null) {
		const pos = caretAtOffset(newMap, newSource, srcOffset);
		if (pos != null) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
	}
	// Hold the view still across the patch: replacing blocks changes heights, and everything
	// below a resized block shifts on screen - the "jump". Anchor the topmost visible position
	// before the dispatch and give the shift back to the scroller after, so the line the user
	// is looking at stays put whether the patch landed above, below, or at the caret. Covers
	// remote edits too: a collaborator editing above your viewport no longer moves your view.
	const scroller = scrollParent(v.dom);
	let anchor: { pos: number; top: number } | null = null;
	if (scroller) {
		try {
			const rect = scroller.getBoundingClientRect();
			const probe = v.posAtCoords({ left: rect.left + rect.width / 2, top: rect.top + 1 });
			if (probe) anchor = { pos: probe.pos, top: v.coordsAtPos(probe.pos).top };
		} catch {
			anchor = null; // no coords for the probe; the patch applies without compensation
		}
	}
	v.dispatch(tr);
	// the patched document is the parse's from here on: its kept blocks equal the parse's, its new
	// ones are the parse's own, a caret block kept as typed keeps its own runs (the parse reads two typed
	// spaces as one) and a grafted caret block is the one that regenerates
	adopt(v.state.doc);
	if (scroller && anchor) {
		try {
			const mapped = Math.min(tr.mapping.map(anchor.pos), v.state.doc.content.size);
			const dy = v.coordsAtPos(mapped).top - anchor.top;
			if (dy !== 0) scroller.scrollTop += dy;
		} catch {
			/* the anchor vanished in the restructure; leave the scroll where the browser put it */
		}
	}
}
