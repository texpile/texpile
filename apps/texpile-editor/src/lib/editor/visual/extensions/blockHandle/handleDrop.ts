// ProseMirror's own drop spot is picked by character offset and lands inside wrappers
import { NodeSelection, PluginKey, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { DropIndicator, dropBarAt } from '$lib/editor/canvas';
import { handleUnitAt } from './handleUnit';

export type HandleDropState = { active: boolean };

export const blockHandlePluginKey = new PluginKey<HandleDropState>('block-handle');

export const handleDropState = {
	init: (): HandleDropState => ({ active: false }),
	apply(tr: Transaction, value: HandleDropState): HandleDropState {
		const meta = tr.getMeta(blockHandlePluginKey) as HandleDropState | undefined;
		return meta ?? value;
	}
};

// an overlay: a line widget inside the next block was lost when that block is drawn as code
let dropLine: DropIndicator | null = null;

export function setHandleDragActive(view: EditorView, active: boolean) {
	if (!active) dropLine?.hide();
	if (blockHandlePluginKey.getState(view.state)?.active === active) return;
	view.dispatch(view.state.tr.setMeta(blockHandlePluginKey, { active }));
}

function dropSpotAt(view: EditorView, node: PMNode, source: { from: number; to: number }, x: number, y: number): number | null {
	const box = view.canvas.sheetClientRect();
	const unitPos = handleUnitAt(view, Math.min(Math.max(x, box.left + 1), box.right - 1), y);
	const { doc } = view.state;
	const unit = unitPos === null ? null : doc.nodeAt(unitPos);
	const rect = unitPos === null ? null : view.canvas.nodeClientRect(unitPos)?.rect;
	if (unitPos === null || !unit || !rect) return null;
	const before = y < (rect.top + rect.bottom) / 2;
	let at = before ? unitPos : unitPos + unit.nodeSize;
	let $at = doc.resolve(at);
	while ($at.depth > 0 && !$at.parent.canReplaceWith($at.index(), $at.index(), node.type)) {
		at = before ? $at.before() : $at.after();
		$at = doc.resolve(at);
	}
	return at >= source.from && at <= source.to ? null : at;
}

function draggedUnit(view: EditorView) {
	const { selection } = view.state;
	return blockHandlePluginKey.getState(view.state)?.active && selection instanceof NodeSelection ? selection : null;
}

function showLine(view: EditorView, line: number | null) {
	dropLine ??= new DropIndicator(view.dom.ownerDocument);
	dropLine.show(line === null ? null : dropBarAt(view, line, null));
}

export const handleDropEvents = {
	dragover(view: EditorView, event: DragEvent) {
		const dragged = draggedUnit(view);
		if (dragged) showLine(view, dropSpotAt(view, dragged.node, dragged, event.clientX, event.clientY));
		return false;
	},
	dragleave(view: EditorView, event: DragEvent) {
		if (draggedUnit(view) && !view.dom.contains(event.relatedTarget as Node | null)) showLine(view, null);
		return false;
	},
	drop(view: EditorView, event: DragEvent) {
		const dragged = draggedUnit(view);
		if (!dragged) return false;
		event.preventDefault();
		dropLine?.hide();
		// eslint-disable-next-line no-param-reassign -- ProseMirror reads view.dragging to know its own drag is running
		(view as unknown as { dragging: unknown }).dragging = null;
		const at = dropSpotAt(view, dragged.node, dragged, event.clientX, event.clientY);
		const tr = view.state.tr.setMeta(blockHandlePluginKey, { active: false }).setMeta('uiEvent', 'drop');
		if (at === null) {
			view.dispatch(tr);
			return true;
		}
		let landed = at;
		if (at > dragged.to) {
			tr.insert(at, dragged.node).delete(dragged.from, dragged.to);
			landed = at - (dragged.to - dragged.from);
		} else {
			tr.delete(dragged.from, dragged.to).insert(at, dragged.node);
		}
		view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, landed)).scrollIntoView());
		view.focus();
		return true;
	}
};
