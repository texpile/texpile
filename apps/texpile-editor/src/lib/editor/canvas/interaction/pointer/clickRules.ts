// prosemirror-view's click handling (PMV/input.ts), ported over VisualView
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { CanvasHit } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';

type ContextProp = 'handleClickOn' | 'handleDoubleClickOn' | 'handleTripleClickOn';

/** the handler props per ancestor of `inside`, innermost first */
function runHandlerOnContext(view: VisualView, prop: ContextProp, pos: number, inside: number, event: MouseEvent): boolean {
	if (inside === -1) return false;
	const $pos = view.state.doc.resolve(inside);
	for (let i = $pos.depth + 1; i > 0; i--) {
		const direct = i > $pos.depth;
		const node = direct ? $pos.nodeAfter! : $pos.node(i);
		const at = $pos.before(i);
		if (view.someProp(prop, (f) => f(view, pos, node, at, event, direct))) return true;
	}
	return false;
}

/** prosemirror-view's inside, except on a figure's caption: its text takes the caret though the figure is an atom */
export function pressedNode(doc: PMNode, hit: CanvasHit): number {
	const target = hit.target.kind === 'cell' ? hit.target.inner : hit.target;
	return target.kind === 'text' && doc.nodeAt(target.textblock)?.isAtom ? -1 : hit.inside;
}

export function updateSelection(view: VisualView, selection: Selection): void {
	if (!view.hasFocus()) view.focus();
	if (view.state.selection.eq(selection)) return;
	view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
}

export function selectClickedLeaf(view: VisualView, inside: number): boolean {
	if (inside === -1) return false;
	const $pos = view.state.doc.resolve(inside);
	const node = $pos.nodeAfter;
	if (!node || !node.isAtom || !NodeSelection.isSelectable(node)) return false;
	updateSelection(view, new NodeSelection($pos));
	return true;
}

/** Ctrl-click (Cmd on macOS): the innermost selectable node, again on a selected one its parent */
export function selectClickedNode(view: VisualView, inside: number): boolean {
	if (inside === -1) return false;
	const selection = view.state.selection;
	const selected = selection instanceof NodeSelection ? selection.node : null;
	const $pos = view.state.doc.resolve(inside);
	let selectAt: number | null = null;
	for (let i = $pos.depth + 1; i > 0; i--) {
		const node = i > $pos.depth ? $pos.nodeAfter! : $pos.node(i);
		if (!NodeSelection.isSelectable(node)) continue;
		const { $from } = selection;
		selectAt =
			selected && $from.depth > 0 && i >= $from.depth && $pos.before($from.depth + 1) === $from.pos
				? $pos.before($from.depth)
				: $pos.before(i);
		break;
	}
	if (selectAt === null) return false;
	updateSelection(view, NodeSelection.create(view.state.doc, selectAt));
	return true;
}

export function handleSingleClick(view: VisualView, pos: number, inside: number, event: MouseEvent, selectNode: boolean): boolean {
	return (
		runHandlerOnContext(view, 'handleClickOn', pos, inside, event) ||
		!!view.someProp('handleClick', (f) => f(view, pos, event)) ||
		(selectNode ? selectClickedNode(view, inside) : selectClickedLeaf(view, inside))
	);
}

export function handleDoubleClick(view: VisualView, pos: number, inside: number, event: MouseEvent): boolean {
	return (
		runHandlerOnContext(view, 'handleDoubleClickOn', pos, inside, event) || !!view.someProp('handleDoubleClick', (f) => f(view, pos, event))
	);
}

/** the textblock or selectable node a triple click selects; selectNodes is false while dragging */
export function selectionForTripleClick(view: VisualView, inside: number, selectNodes: boolean): Selection | null {
	const { doc } = view.state;
	if (inside === -1) return doc.inlineContent ? TextSelection.create(doc, 0, doc.content.size) : null;
	const $pos = doc.resolve(inside);
	for (let i = $pos.depth + 1; i > 0; i--) {
		const node = i > $pos.depth ? $pos.nodeAfter! : $pos.node(i);
		const nodePos = $pos.before(i);
		if (node.inlineContent) return TextSelection.create(doc, nodePos + 1, nodePos + 1 + node.content.size);
		if (selectNodes && NodeSelection.isSelectable(node)) return NodeSelection.create(doc, nodePos);
	}
	return null;
}

export function handleTripleClick(view: VisualView, pos: number, inside: number, event: MouseEvent): boolean {
	return (
		runHandlerOnContext(view, 'handleTripleClickOn', pos, inside, event) || !!view.someProp('handleTripleClick', (f) => f(view, pos, event))
	);
}

/** the selection made, which a drag then extends by paragraphs when it is a text range */
export function defaultTripleClick(view: VisualView, inside: number, event: MouseEvent): Selection | null {
	if (event.button !== 0) return null;
	const selection = selectionForTripleClick(view, inside, true);
	if (selection) updateSelection(view, selection);
	return selection;
}
