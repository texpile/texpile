// notion-style block handle: floating insert/drag/delete gutters beside the hovered block
import { caretAfterDelete } from './blockHandle/caretAfterDelete';
import { Plugin, NodeSelection, type EditorState } from 'prosemirror-state';
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import BlockHandle from './BlockHandle.svelte';
import { scrollParent } from '$lib/editor/visual/scrollParent';
import type { BlockInsertItem, InsertItem } from '$lib/editor/visual/insert/insertItem';
import { insertItems } from '$lib/editor/visual/insert/insertItems.svelte';
import { insertBlockAfter } from '$lib/editor/visual/insert/insertRun';
import { returnFocusToText } from './popoverFocus/returnFocus';
import { handleUnitAt } from './blockHandle/handleUnit';
import { positionOf } from './blockHandle/nodePosition';
import { blockHandlePluginKey, handleDropEvents, handleDropLine, handleDropState, setHandleDragActive } from './blockHandle/handleDrop';

type ItemsOf = () => readonly InsertItem[];

// left gutter width: two ~22px buttons plus gap
const GUTTER_OFFSET_LEFT = 48;
const GUTTER_OFFSET_RIGHT = 8;
// one button wide plus the gap to the text: the stacked gutter, while comments crowd the pane (the scroller's
// data-gutter-stacked, which the comment rail decides)
const GUTTER_OFFSET_LEFT_STACKED = 30;
// one handle button (app.css .block-handle-btn); the side by side gutter is two and a 2px gap
const HANDLE_W = 22;

// a \noindent paragraph prints its own label in this same left margin, at the block's top edge
// (app.css). Drop the gutter clear of it rather than have the two draw over each other.
const NOINDENT_LABEL_DROP = 22;
function dropsForLabel(dom: HTMLElement) {
	if (dom.tagName === 'P') return dom.dataset.indent === 'noindent';
	// a list item's first paragraph prints its label out past the bullet, which is this margin too
	return dom.querySelector(":scope > .list-content > p:first-child[data-indent='noindent']") !== null;
}

class BlockHandleView {
	private view: EditorView;
	private host: HTMLElement;
	private component: Record<string, unknown> | null = null;
	private state = $state<{
		visible: boolean;
		top: number;
		left: number;
		right: number;
		stacked: boolean;
		popoverOpen: boolean;
	}>({
		visible: false,
		top: 0,
		left: 0,
		right: 0,
		stacked: false,
		popoverOpen: false
	});
	private hoveredPos: number | null = null;
	private hoveredNode: PMNode | null = null;
	private hideTimer: number | null = null;
	private rafId: number | null = null;
	// the last pointer y over the editor, so a scroll can re-anchor without a new mouse event
	private lastPointerY: number | null = null;
	private pointerInside = false;

	constructor(view: EditorView, items: ItemsOf) {
		this.view = view;

		this.host = document.createElement('div');
		this.host.className = 'block-handle-host';
		// the editor's own window, which may be one of its own
		view.dom.ownerDocument.body.appendChild(this.host);
		this.component = mount(BlockHandle, {
			target: this.host,
			props: {
				state: this.state,
				onInsert: (item: BlockInsertItem) => this.runInsert(item),
				onDragStart: this.onDragStart,
				onDelete: this.runDelete,
				focusEditor: () => returnFocusToText(view),
				items: () => items().filter((item): item is BlockInsertItem => item.shape === 'block')
			}
		});

		view.dom.addEventListener('mousemove', this.onMouseMove);
		view.dom.addEventListener('mouseleave', this.onMouseLeave);
		this.host.addEventListener('mouseenter', this.cancelHide);
		this.host.addEventListener('mouseleave', this.scheduleHide);
		// capture, because scroll does not bubble: this has to catch the editor's scroller and any
		// nested one (a wide table's wrapper) without knowing which exists
		view.dom.ownerDocument.addEventListener('dragend', this.onDragEnd, true);
		view.dom.ownerDocument.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
	}

	private onMouseMove = (event: MouseEvent) => {
		this.pointerInside = true;
		this.lastPointerY = event.clientY;
		if (this.state.popoverOpen) return; // frozen while the insert menu is open
		this.queueUpdate(event.clientY);
	};

	private onMouseLeave = () => {
		this.pointerInside = false;
		this.scheduleHide();
	};

	/**
	 * Nothing else recomputes the gutter while the document scrolls, so without this a wheel scroll
	 * leaves it parked at the old viewport position while its block slides out from under it - and
	 * a fixed-positioned gutter on document.body is clipped by nothing, so it lands on the toolbar.
	 */
	private onScroll = () => {
		if (this.state.popoverOpen || !this.state.visible) return;
		// no pointer to re-anchor to (scrolling with the gutter itself hovered, say): hide rather
		// than leave it pointing at a block that has moved
		if (!this.pointerInside || this.lastPointerY == null) {
			this.state.visible = false;
			return;
		}
		this.queueUpdate(this.lastPointerY);
	};

	private queueUpdate(y: number) {
		if (this.rafId != null) cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.updateFromPoint(y);
		});
	}

	// x is pinned to the editor's center so horizontal mouse movement never re-anchors the
	// handle to an ancestor block; y alone picks the unit
	private blockAt(y: number): number | null {
		const containerRect = this.view.dom.getBoundingClientRect();
		return handleUnitAt(this.view, containerRect.left + containerRect.width / 2, y);
	}

	private updateFromPoint(y: number) {
		const blockPos = this.blockAt(y);
		if (blockPos == null) return; // over padding or outside the doc, leave the gutter as-is
		this.hoveredPos = blockPos;
		this.hoveredNode = this.view.state.doc.nodeAt(blockPos);

		const dom = this.view.nodeDOM(blockPos);
		if (!(dom instanceof HTMLElement)) return;

		const rect = dom.getBoundingClientRect();
		const top = rect.top + (dropsForLabel(dom) ? NOINDENT_LABEL_DROP : 0);
		// anchor horizontal to view.dom, not the block: per-node indents (lists, quotes,
		// centered figures) would make the gutter jump around
		const containerRect = this.view.dom.getBoundingClientRect();
		const stacked = this.view.dom.closest('[data-gutter-stacked]') !== null;
		const left = containerRect.left - (stacked ? GUTTER_OFFSET_LEFT_STACKED : GUTTER_OFFSET_LEFT);
		// null scroller = nothing can scroll, so nothing can be out of view
		const area = scrollParent(this.view.dom)?.getBoundingClientRect();
		// A tall block whose top has scrolled past the editor's visible area would put the gutter
		// over the toolbar above it, or off-screen entirely. Hidden rather than pinned to the top
		// edge: the gutter's y IS which block it acts on, and one of these buttons deletes, so a
		// handle floating away from the block edge it belongs to would be guessing on the user's
		// behalf. Scroll the block's top back into view and it comes back.
		// Sideways, while the pane is scrolled to the comment cards, it stops at the pane's edge, whole
		// and grabbable, for as long as it still fits before the text, and goes once it does not.
		const width = stacked ? HANDLE_W : 2 * HANDLE_W + 2;
		const pinned = area ? Math.max(left, area.left) : left;
		if (area && (top < area.top || pinned + width > containerRect.left)) {
			this.state.visible = false;
			return;
		}
		this.cancelHide();
		this.state.visible = true;
		this.state.top = top;
		this.state.stacked = stacked;
		this.state.left = pinned;
		this.state.right = containerRect.right + GUTTER_OFFSET_RIGHT;
	}

	private cancelHide = () => {
		if (this.hideTimer != null) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	};
	private scheduleHide = () => {
		if (this.state.popoverOpen) return; // don't hide while the menu is open
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => {
			// re-check at fire time: the menu may have opened during the wait, and hiding now
			// would collapse the trigger rect Floating-UI anchors the popover to
			if (this.state.popoverOpen) return;
			this.state.visible = false;
		}, 120);
	};

	private onDragStart = (event: DragEvent) => {
		if (this.hoveredPos == null) return;
		const { view } = this;
		const sel = NodeSelection.create(view.state.doc, this.hoveredPos);
		view.dispatch(view.state.tr.setSelection(sel).setMeta(blockHandlePluginKey, { active: true }));
		(view as unknown as { dragging: unknown }).dragging = { slice: sel.content(), move: true };
		event.dataTransfer?.setData('text/plain', '');
		// eslint-disable-next-line no-param-reassign -- the DnD API works by mutating the event's dataTransfer
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		const dom = view.nodeDOM(this.hoveredPos);
		if (dom instanceof HTMLElement) event.dataTransfer?.setDragImage(dom, 0, 0);
		this.scheduleHide();
	};

	private runInsert(item: BlockInsertItem) {
		if (this.hoveredPos == null) return;
		const { view } = this;
		// a block that cannot go beside the hovered one goes after the nearest block around it that can hold it
		const tr = insertBlockAfter(view.state, this.hoveredPos, item);
		if (!tr) return;
		view.dispatch(tr);
		// close the popover before focusing PM: Zag restores focus to the trigger on dismiss and
		// would yank it back. one frame later, view.focus() takes focus for good.
		this.state.popoverOpen = false;
		requestAnimationFrame(() => view.focus());
		this.scheduleHide();
	}

	private runDelete = () => {
		if (this.hoveredPos == null) return;
		const { view } = this;
		const node = view.state.doc.nodeAt(this.hoveredPos);
		if (!node) return;
		// tr.delete respects the schema: removing the last required child (e.g. last table row)
		// no-ops instead of corrupting the doc
		const { from, to } = view.state.selection;
		const end = this.hoveredPos + node.nodeSize;
		const tr = view.state.tr.delete(this.hoveredPos, end);
		// a caret inside the block would map to the start of the next one; Word leaves it at the end of the one before
		if (tr.docChanged && to > this.hoveredPos && from < end) tr.setSelection(caretAfterDelete(tr.doc, this.hoveredPos));
		view.dispatch(tr);
		view.focus();
		this.state.visible = false;
		this.hoveredPos = null;
		this.hoveredNode = null;
	};

	private onDragEnd = () => setHandleDragActive(this.view, false);

	update(view: EditorView, prevState: EditorState) {
		view.dom.ownerDocument.documentElement.classList.toggle('pm-handle-drag', blockHandlePluginKey.getState(view.state)?.active === true);
		if (view.state.doc === prevState.doc) return;
		// a guest's edit while the menu is open moves the block, or takes it away
		if (this.state.popoverOpen) {
			this.hoveredPos = this.hoveredNode ? positionOf(view.state.doc, this.hoveredNode) : null;
			return;
		}
		if (!this.state.visible) return;
		// the block under the gutter may have moved or gone
		if (this.pointerInside && this.lastPointerY != null) this.queueUpdate(this.lastPointerY);
		else this.state.visible = false;
	}

	destroy() {
		this.view.dom.removeEventListener('mousemove', this.onMouseMove);
		this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
		this.host.removeEventListener('mouseenter', this.cancelHide);
		this.host.removeEventListener('mouseleave', this.scheduleHide);
		this.view.dom.ownerDocument.removeEventListener('dragend', this.onDragEnd, true);
		this.view.dom.ownerDocument.documentElement.classList.remove('pm-handle-drag');
		this.view.dom.ownerDocument.removeEventListener('scroll', this.onScroll, { capture: true });
		this.cancelHide();
		if (this.rafId != null) cancelAnimationFrame(this.rafId);
		if (this.component) unmount(this.component);
		this.host.remove();
	}
}

/** items: what the + menu offers; the open file's insert list unless the language has a fixed one */
export function createBlockHandlePlugin(opts: { items?: ItemsOf } = {}) {
	return new Plugin({
		key: blockHandlePluginKey,
		state: handleDropState,
		props: {
			decorations: (state) => handleDropLine(blockHandlePluginKey.getState(state), state.doc),
			handleDOMEvents: handleDropEvents
		},
		view: (view) => new BlockHandleView(view, opts.items ?? (() => insertItems.current))
	});
}
