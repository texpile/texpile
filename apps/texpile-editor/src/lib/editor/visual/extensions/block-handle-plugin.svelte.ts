// notion-style block handle: floating insert/drag/delete gutters beside the hovered block
import { Plugin, PluginKey, NodeSelection, TextSelection } from 'prosemirror-state';
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import BlockHandle from './BlockHandle.svelte';
import { scrollParent } from '$lib/editor/visual/scrollParent';
import type { BlockInsertItem } from './blockInsertItems';

export const blockHandlePluginKey = new PluginKey('block-handle');

// left gutter width: two ~22px buttons plus gap
const GUTTER_OFFSET_LEFT = 48;
const GUTTER_OFFSET_RIGHT = 8;

// a \noindent paragraph prints its own label in this same left margin, at the block's top edge
// (app.css). Drop the gutter clear of it rather than have the two draw over each other.
const NOINDENT_LABEL_DROP = 22;
function dropsForLabel(dom: HTMLElement) {
	return dom.tagName === 'P' && dom.dataset.indent === 'noindent';
}

// skipped when resolving the hovered block: dragging a row/cell out would tear the schema,
// so hovering inside a cell surfaces the outer table_wrapper instead
const SKIP_NODE_TYPES = new Set(['table_row', 'table_cell', 'table_header']);

class BlockHandleView {
	private view: EditorView;
	private host: HTMLElement;
	private component: Record<string, unknown> | null = null;
	private state = $state<{ visible: boolean; top: number; left: number; right: number; popoverOpen: boolean }>({
		visible: false,
		top: 0,
		left: 0,
		right: 0,
		popoverOpen: false
	});
	private hoveredPos: number | null = null;
	private hideTimer: number | null = null;
	private rafId: number | null = null;
	// the last pointer y over the editor, so a scroll can re-anchor without a new mouse event
	private lastPointerY: number | null = null;
	private pointerInside = false;

	constructor(view: EditorView, items?: BlockInsertItem[]) {
		this.view = view;

		this.host = document.createElement('div');
		this.host.className = 'block-handle-host';
		document.body.appendChild(this.host);
		this.component = mount(BlockHandle, {
			target: this.host,
			props: {
				state: this.state,
				onInsert: (item: BlockInsertItem) => this.runInsert(item),
				onDragStart: this.onDragStart,
				onDelete: this.runDelete,
				items
			}
		});

		view.dom.addEventListener('mousemove', this.onMouseMove);
		view.dom.addEventListener('mouseleave', this.onMouseLeave);
		this.host.addEventListener('mouseenter', this.cancelHide);
		this.host.addEventListener('mouseleave', this.scheduleHide);
		// capture, because scroll does not bubble: this has to catch the editor's scroller and any
		// nested one (a wide table's wrapper) without knowing which exists
		document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
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
	// handle to an ancestor block; y alone picks the block. returns its pre-position or null.
	private blockAt(y: number): number | null {
		const containerRect = this.view.dom.getBoundingClientRect();
		const stableX = containerRect.left + containerRect.width / 2;
		const coords = this.view.posAtCoords({ left: stableX, top: y });
		if (!coords) return null;
		// coords.inside is the only way to hit atomic-leaf nodeviews (raw_latex / code_block / block_math):
		// PM can't resolve a coord inside their opaque DOM, so the depth walk below only finds the parent
		if (coords.inside >= 0) {
			const insideNode = this.view.state.doc.nodeAt(coords.inside);
			if (insideNode && insideNode.isBlock && !SKIP_NODE_TYPES.has(insideNode.type.name)) {
				return coords.inside;
			}
		}
		// fallback: between blocks (inside -1) or a skipped node, walk up for a usable ancestor
		const resolved = this.view.state.doc.resolve(coords.pos);
		for (let depth = resolved.depth; depth > 0; depth--) {
			const node = resolved.node(depth);
			if (node.isBlock && !SKIP_NODE_TYPES.has(node.type.name)) return resolved.before(depth);
		}
		return null;
	}

	private updateFromPoint(y: number) {
		const blockPos = this.blockAt(y);
		if (blockPos == null) return; // over padding or outside the doc, leave the gutter as-is
		this.hoveredPos = blockPos;

		const dom = this.view.nodeDOM(blockPos);
		if (!(dom instanceof HTMLElement)) return;

		const rect = dom.getBoundingClientRect();
		const top = rect.top + (dropsForLabel(dom) ? NOINDENT_LABEL_DROP : 0);
		// A tall block whose top has scrolled past the editor's visible area would put the gutter
		// over the toolbar above it, or off-screen entirely. Hidden rather than pinned to the top
		// edge: the gutter's y IS which block it acts on, and one of these buttons deletes, so a
		// handle floating away from the block edge it belongs to would be guessing on the user's
		// behalf. Scroll the block's top back into view and it comes back.
		if (this.aboveVisibleArea(top)) {
			this.state.visible = false;
			return;
		}
		// anchor horizontal to view.dom, not the block: per-node indents (lists, quotes,
		// centered figures) would make the gutter jump around
		const containerRect = this.view.dom.getBoundingClientRect();
		this.cancelHide();
		this.state.visible = true;
		this.state.top = top;
		this.state.left = containerRect.left - GUTTER_OFFSET_LEFT;
		this.state.right = containerRect.right + GUTTER_OFFSET_RIGHT;
	}

	/** null scroller = nothing can scroll, so nothing can be out of view and the check is moot. */
	private aboveVisibleArea(top: number): boolean {
		const scroller = scrollParent(this.view.dom);
		return scroller != null && top < scroller.getBoundingClientRect().top;
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
		view.dispatch(view.state.tr.setSelection(sel));
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
		const hovered = view.state.doc.nodeAt(this.hoveredPos);
		const node = item.make(view.state.schema);
		if (!hovered || !node) return;
		// insert as next sibling; if the parent can't accept the node type (heading in a list, ...),
		// walk up to the nearest ancestor that can, so the click never silently fails
		let at = this.hoveredPos + hovered.nodeSize;
		let resolvedAt = view.state.doc.resolve(at);
		while (resolvedAt.depth > 0 && !resolvedAt.parent.canReplaceWith(resolvedAt.index(), resolvedAt.index(), node.type)) {
			at = resolvedAt.after();
			resolvedAt = view.state.doc.resolve(at);
		}
		const tr = view.state.tr.insert(at, node);
		const sel = item.select === 'node' ? NodeSelection.create(tr.doc, at) : TextSelection.near(tr.doc.resolve(at + 1));
		tr.setSelection(sel).scrollIntoView();
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
		const tr = view.state.tr.delete(this.hoveredPos, this.hoveredPos + node.nodeSize);
		view.dispatch(tr);
		view.focus();
		this.state.visible = false;
		this.hoveredPos = null;
	};

	update() {
		if (!this.state.popoverOpen) this.scheduleHide();
	}

	destroy() {
		this.view.dom.removeEventListener('mousemove', this.onMouseMove);
		this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
		this.host.removeEventListener('mouseenter', this.cancelHide);
		this.host.removeEventListener('mouseleave', this.scheduleHide);
		document.removeEventListener('scroll', this.onScroll, { capture: true });
		this.cancelHide();
		if (this.rafId != null) cancelAnimationFrame(this.rafId);
		if (this.component) unmount(this.component);
		this.host.remove();
	}
}

export function createBlockHandlePlugin(opts: { items?: BlockInsertItem[] } = {}) {
	return new Plugin({
		key: blockHandlePluginKey,
		view: (view) => new BlockHandleView(view, opts.items)
	});
}
