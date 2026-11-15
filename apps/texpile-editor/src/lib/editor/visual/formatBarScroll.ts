// the floating format bar sits over the top of the editor's scroll area, so a caret scrolled up to that edge stopped
// under the bar and showed nowhere, and at the bottom one stopped a few pixels under the edge. Four scrollers bring a
// caret there (the browser's own for arrows inside text, ProseMirror's, a chip's CodeMirror and a formula's field), so
// the caret is moved clear of both edges after any of them
import { Plugin } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { EditorView } from 'prosemirror-view';
import { scrollParent } from './scrollParent';

const EDGE = 5;

function caretBox(view: EditorView): { top: number; bottom: number } | null {
	// a scroll of someone else's making (a guest's edit, the wheel) leaves the page where it is
	const active = document.activeElement;
	if (!active || !view.dom.contains(active)) return null;
	// a chip's CodeMirror can keep cm-focused after the focus has left it
	const chip = active.closest('.cm-editor');
	if (chip) return chip.querySelector('.cm-cursor')?.getBoundingClientRect() ?? null;
	// a formula's field draws its caret inside itself
	if (active.tagName === 'MATH-FIELD') return active.getBoundingClientRect();
	if (view.state.selection instanceof GapCursor) {
		const gap = view.dom.querySelector('.ProseMirror-gapcursor')?.getBoundingClientRect();
		return gap ? { top: gap.top, bottom: gap.top + 2 } : null;
	}
	const dom = getSelection();
	if (!view.hasFocus() || !dom?.rangeCount || !dom.focusNode || !view.dom.contains(dom.focusNode)) return null;
	return caretRect(dom.focusNode, dom.focusOffset);
}

/** the box of a caret, read off the character beside it where the browser gives the bare caret none (a line's start) */
export function caretRect(node: globalThis.Node, offset: number): DOMRect | null {
	const range = document.createRange();
	range.setStart(node, offset);
	const bare = range.getClientRects()[0];
	if (bare) return bare;
	if (node.nodeType === 3) {
		const length = (node as Text).length;
		if (!length) return null;
		const at = Math.min(offset, length - 1);
		range.setStart(node, at);
		range.setEnd(node, at + 1);
		return range.getClientRects()[0] ?? null;
	}
	// a neighbour drawn as nothing (ProseMirror's separator image) has no box to read
	const child = [node.childNodes[offset], node.childNodes[offset - 1]].find((c) => c instanceof Element && c.getClientRects().length);
	return child instanceof Element ? child.getBoundingClientRect() : node instanceof Element ? node.getBoundingClientRect() : null;
}

// a caret this far under the scroll area, moved by no key, is one an edit nudged there; further down the reader scrolled away
const BELOW = 48;

function clearOfEdges(view: EditorView, keyed: boolean): void {
	const box = caretBox(view);
	const port = box ? scrollParent(view.dom) : null;
	if (!box || !port) return;
	const area = port.getBoundingClientRect();
	const bottom = area.top + port.clientTop + port.clientHeight - EDGE;
	const bar = view.dom.closest('.floating-bar-room')?.querySelector('[data-format-bar]');
	const top = (bar?.getBoundingClientRect().bottom ?? area.top) + EDGE;
	// a caret a key moved is shown wherever it went; any other far from the edges is somewhere the reader scrolled from
	if (box.top < top && (keyed || (bar && box.bottom > area.top))) port.scrollTop -= top - box.top;
	else if (box.bottom > bottom && (keyed || box.top < bottom + BELOW)) port.scrollTop += box.bottom - bottom;
}

export function caretClearOfFormatBar(): Plugin {
	return new Plugin({
		view(view) {
			let frame = 0;
			// keys in a chip's editor or a formula's field included
			let keyAt = 0;
			function keyed() {
				keyAt = performance.now();
			}
			view.dom.addEventListener('keydown', keyed, true);
			// the browser scrolls a caret it moved itself into view as it next renders: look the frame after
			function check() {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(() => {
					frame = requestAnimationFrame(() => view.isDestroyed || clearOfEdges(view, performance.now() - keyAt < 500));
				});
			}
			document.addEventListener('selectionchange', check);
			return {
				update(view, prev) {
					if (!prev.selection.eq(view.state.selection) || !prev.doc.eq(view.state.doc)) check();
				},
				destroy() {
					cancelAnimationFrame(frame);
					document.removeEventListener('selectionchange', check);
					view.dom.removeEventListener('keydown', keyed, true);
				}
			};
		}
	});
}
