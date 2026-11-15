// a selection ProseMirror hides (a selected node, a table's cells, a gap cursor) is hidden on the node that holds it
import type { Node, ResolvedPos } from 'prosemirror-model';
import { GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, Plugin, type EditorState, type Selection } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import './hiddenSelection.css';

const IN_TABLE = new Set(['row', 'cell', 'header_cell']);

/** the node whose box holds all the browser would paint of `selection`; null for one that shows, or one held by the page */
export function hiddenSelectionHolder(selection: Selection): { from: number; to: number } | null {
	if (selection.visible) return null;
	if (selection instanceof NodeSelection) return { from: selection.from, to: selection.to };
	const { $from, $to } = selection;
	let depth = $from.sharedDepth($to.pos);
	// the browser's range over selected cells runs through the cells between them; a gap cursor stays in its own block
	if (!selection.empty) while (depth > 0 && IN_TABLE.has(($from.node(depth) as Node).type.spec.tableRole as string)) depth--;
	return depth > 0 ? { from: $from.before(depth), to: $from.after(depth) } : null;
}

/** a block the browser can put its caret in: editable itself or somewhere inside (a caption), unlike a chip or a formula */
export function takesCaret(dom: globalThis.Node | null): boolean {
	return dom instanceof HTMLElement && (dom.isContentEditable || !!dom.querySelector('[contenteditable="true"]'));
}

// the nearest block toward `dir` that takes a caret, past drawn ones, out of the parent when it holds none
function caretBlockToward($from: ResolvedPos, dir: -1 | 1, takes: (pos: number) => boolean): number | null {
	for (let $p = $from; ; $p = $p.doc.resolve(dir < 0 ? $p.before() : $p.after())) {
		for (let i = dir < 0 ? $p.index() - 1 : $p.index(); i >= 0 && i < $p.parent.childCount; i += dir) {
			const pos = $p.posAtIndex(i);
			if (takes(pos)) return pos;
		}
		if ($p.depth === 0) return null;
	}
}

function decorate(state: EditorState, takes: (pos: number) => boolean): DecorationSet {
	const { selection } = state;
	if (selection.visible) return DecorationSet.empty;
	const decorations: Decoration[] = [];
	const holder = hiddenSelectionHolder(selection);
	if (holder) decorations.push(Decoration.node(holder.from, holder.to, { class: 'pm-selection-hidden' }));
	// Chrome paints its own caret beside a hidden selection, in the nearest block on each side that takes one
	if ((selection instanceof GapCursor || selection instanceof NodeSelection) && !selection.$from.parent.inlineContent)
		for (const pos of [caretBlockToward(selection.$from, -1, takes), caretBlockToward(selection.$to, 1, takes)])
			if (pos !== null) decorations.push(Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, { class: 'pm-caret-hidden' }));
	return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

/** the browser's range around exactly one drawn block, or over all of its contents, read back as that block selected */
export function drawnBlockBetween(view: EditorView, $anchor: ResolvedPos, $head: ResolvedPos): NodeSelection | null {
	const [$from, $to] = $anchor.pos <= $head.pos ? [$anchor, $head] : [$head, $anchor];
	const at: number[] = [];
	// where holdHiddenSelection puts it: before a formula takes the focus, that range read back as its hidden source
	if ($from.depth > 0 && $from.sameParent($to) && $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size)
		at.push($from.before());
	if ($from.nodeAfter && $from.pos + $from.nodeAfter.nodeSize === $to.pos) at.push($from.pos);
	for (const pos of at) {
		const node = $from.doc.nodeAt(pos);
		const dom = view.nodeDOM(pos);
		if (node && NodeSelection.isSelectable(node) && dom instanceof HTMLElement && !dom.isContentEditable)
			return NodeSelection.create($from.doc, pos);
	}
	return null;
}

// ProseMirror sets the browser's range between the blocks around a selected one, and a gap cursor's caret between the
// two blocks beside it. Between drawn blocks Chrome has no place for either and moves it at the next key, a Shift or
// Ctrl too, to the first place it can edit: the document's start. A selected block holds it over its own contents, a
// gap in the gap cursor's element
function holdHiddenSelection(view: EditorView): void {
	const { selection } = view.state;
	// a formula takes the focus as it is selected, and ProseMirror reads the browser's range all the same
	const active = view.dom.ownerDocument.activeElement;
	if (selection.visible || !active || !view.dom.contains(active)) return;
	const domSelection = view.dom.ownerDocument.getSelection();
	if (!domSelection) return;
	// ProseMirror writes its range again on any redraw, a decoration's too
	function holds(el: Element): boolean {
		return !!domSelection?.anchorNode && el.contains(domSelection.anchorNode);
	}
	if (selection instanceof GapCursor) {
		const gap = view.dom.querySelector('.ProseMirror-gapcursor');
		if (gap && !holds(gap)) domSelection.collapse(gap, 0);
		return;
	}
	if (!(selection instanceof NodeSelection)) return;
	const dom = view.nodeDOM(selection.from);
	// a live formula field or a chip's editor inside is somewhere Chrome will not keep a range: it took it to the start
	if (takesCaret(dom) || !(dom instanceof HTMLElement) || !dom.firstChild || holds(dom)) return;
	domSelection.setBaseAndExtent(dom, 0, dom, dom.childNodes.length);
}

// the page still draws the node at `pos`: the same node object stands there in the document it shows
function drawnAs(shown: Node, doc: Node, pos: number): boolean {
	return shown === doc || (pos < shown.content.size && shown.nodeAt(pos) === doc.nodeAt(pos));
}

export function hiddenSelectionPlugin(): Plugin {
	// the page as last drawn: the DOM says which blocks take a caret where it still draws the state's nodes
	let shown: { view: EditorView; doc: Node } | null = null;
	return new Plugin({
		view(view) {
			shown = { view, doc: view.state.doc };
			return {
				update(view) {
					shown = { view, doc: view.state.doc };
					holdHiddenSelection(view);
				},
				destroy() {
					shown = null;
				}
			};
		},
		props: {
			attributes: { class: 'pm-block-carets' },
			decorations: (state) =>
				decorate(state, (pos) => (shown && drawnAs(shown.doc, state.doc, pos) ? takesCaret(shown.view.nodeDOM(pos)) : true)),
			// ProseMirror reads the selection back from the browser after a key or a click, and has no way from a range around
			// one block back to that block: it took the nearest text, past two drawn blocks the document's start
			createSelectionBetween: drawnBlockBetween
		}
	});
}
