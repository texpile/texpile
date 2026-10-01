// A mouse drag selects with the browser's own selection, which can neither end nor start where there
// is no text: on a block the browser does not edit (a formula, a CodeMirror island, an image, an
// included file), past the last of them at the document's edge, or at a gap cursor beside one. So the
// block under the pointer was left out, and a drag begun at a gap cursor selected nothing. While the
// pointer is on such a block, or above or below the whole document, the drag ends past that block;
// a drag begun at a gap is drawn here from start to end. The range painter shades the blocks crossed.
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, TextSelection, type Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { gapCursorAt } from '../../gapSelection';

/** `own`: begun at a gap, where the browser has no selection to give, so `head` is the whole story */
type Drag = { doc: PMNode; anchor: number; head: number | null; own: boolean };

/** ProseMirror sets this on every node it renders without editable content, whatever draws it */
function uneditable(view: EditorView, pos: number): boolean {
	const dom = view.nodeDOM(pos);
	return dom instanceof HTMLElement && dom.getAttribute('contenteditable') === 'false';
}

/** the uneditable block at `pos`, or the one holding it */
function uneditableBlock(view: EditorView, pos: number): { from: number; to: number } | null {
	const { doc } = view.state;
	const node = doc.nodeAt(pos);
	if (node?.isBlock && uneditable(view, pos)) return { from: pos, to: pos + node.nodeSize };
	const $pos = doc.resolve(pos);
	for (let d = $pos.depth; d > 0; d--) {
		if (uneditable(view, $pos.before(d))) return { from: $pos.before(d), to: $pos.after(d) };
	}
	return null;
}

function edgeOf(view: EditorView, pos: number, edge: 'top' | 'bottom'): number | null {
	const dom = view.nodeDOM(pos);
	return dom instanceof HTMLElement ? dom.getBoundingClientRect()[edge] : null;
}

/** the document position under (x, y), held inside the editor's box */
function posAt(view: EditorView, x: number, y: number): { pos: number; inside: number } | null {
	const box = view.dom.getBoundingClientRect();
	return view.posAtCoords({
		left: Math.min(Math.max(x, box.left + 1), box.right - 1),
		top: Math.min(Math.max(y, box.top + 1), box.bottom - 1)
	});
}

/** where the drag ends with the pointer at (x, y) when that is past an uneditable block, else null */
function reachAt(view: EditorView, x: number, y: number, anchor: number): number | null {
	const { doc } = view.state;
	const first = doc.firstChild;
	const last = doc.lastChild;
	if (!first || !last) return null;
	const lastAt = doc.content.size - last.nodeSize;
	// beyond the document is its very edge, which the browser cannot reach past an uneditable block
	if (y > (edgeOf(view, lastAt, 'bottom') ?? Infinity)) return uneditableBlock(view, lastAt) ? doc.content.size : null;
	if (y < (edgeOf(view, 0, 'top') ?? -Infinity)) return uneditableBlock(view, 0) ? 0 : null;
	const hit = posAt(view, x, y);
	if (!hit || hit.inside < 0) return null;
	const block = uneditableBlock(view, hit.inside);
	if (!block) return null;
	if (block.from >= anchor) return block.to;
	if (block.to <= anchor) return block.from;
	return null;
}

/** whether a selection's head already goes past the block the drag is on */
function reaches(head: number, anchor: number, reach: number): boolean {
	return reach > anchor ? head >= reach : head <= reach;
}

function selectionFor(doc: PMNode, anchor: number, head: number): Selection {
	return (anchor === head && gapCursorAt(doc.resolve(anchor))) || TextSelection.create(doc, anchor, head);
}

function select(view: EditorView, sel: Selection): void {
	if (!sel.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(sel).setMeta('pointer', true));
}

/** the browser paints the text of its own selection only, so a drag drawn here sets that too */
function selectNatively(view: EditorView, anchor: number, head: number): void {
	const a = view.domAtPos(anchor);
	const h = view.domAtPos(head);
	try {
		view.dom.ownerDocument.getSelection()?.setBaseAndExtent(a.node, a.offset, h.node, h.offset);
	} catch {
		/* a position the DOM cannot hold: the shade still shows the blocks */
	}
}

/** where the browser's own selection ends, as a document position */
function nativeHead(view: EditorView): number | null {
	const sel = view.dom.ownerDocument.getSelection();
	if (!sel?.focusNode || !view.dom.contains(sel.focusNode)) return null;
	try {
		return view.posAtDOM(sel.focusNode, sel.focusOffset);
	} catch {
		return null;
	}
}

export function dragSelectionPlugin(): Plugin {
	let drag: Drag | null = null;

	return new Plugin({
		view(view) {
			const win = view.dom.ownerDocument.defaultView ?? window;
			function stop() {
				drag = null;
				win.removeEventListener('mousemove', move);
				win.removeEventListener('mouseup', stop);
			}
			function move(e: MouseEvent) {
				if (!drag || !(e.buttons & 1) || view.state.doc !== drag.doc) return stop();
				const reach = reachAt(view, e.clientX, e.clientY, drag.anchor);
				if (drag.own) {
					const head = reach ?? posAt(view, e.clientX, e.clientY)?.pos ?? null;
					if (head === null) return;
					drag.head = head;
					select(view, selectionFor(view.state.doc, drag.anchor, head));
					if (head !== drag.anchor) selectNatively(view, drag.anchor, head);
					return;
				}
				const was = drag.head;
				drag.head = reach;
				if (reach !== null) {
					if (!reaches(view.state.selection.head, drag.anchor, reach)) select(view, selectionFor(view.state.doc, drag.anchor, reach));
				} else if (was !== null) {
					// back over text the browser can reach, whose own end may not have moved since
					const head = nativeHead(view);
					if (head !== null) select(view, selectionFor(view.state.doc, drag.anchor, head));
				}
			}
			function start(e: Event) {
				const ev = e as MouseEvent;
				stop();
				if (ev.button !== 0 || ev.detail > 1 || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
				// a drag begun inside an island is the island's own selection
				const island = (ev.target as Element | null)?.closest?.('[contenteditable="false"]');
				if (island && view.dom.contains(island)) return;
				const hit = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
				if (!hit) return;
				const { doc } = view.state;
				const $hit = doc.resolve(hit.pos);
				if ($hit.parent.inlineContent) drag = { doc, anchor: hit.pos, head: null, own: false };
				else {
					const gap = gapCursorAt($hit);
					if (!gap) return;
					// the browser would start its selection in some text nearby instead
					ev.preventDefault();
					view.focus();
					select(view, gap);
					drag = { doc: view.state.doc, anchor: hit.pos, head: hit.pos, own: true };
				}
				win.addEventListener('mousemove', move);
				win.addEventListener('mouseup', stop);
			}
			view.dom.addEventListener('mousedown', start);
			return {
				destroy() {
					stop();
					view.dom.removeEventListener('mousedown', start);
				}
			};
		},
		// the browser reports its own selection as the pointer moves; the drag keeps the one set here
		appendTransaction(trs, _old, state) {
			if (!drag || drag.head === null || state.doc !== drag.doc || !trs.some((tr) => tr.selectionSet)) return null;
			const { anchor, head } = state.selection;
			if (drag.own ? anchor === drag.anchor && head === drag.head : reaches(head, drag.anchor, drag.head)) return null;
			return state.tr.setSelection(selectionFor(state.doc, drag.anchor, drag.head)).setMeta('pointer', true);
		}
	});
}
