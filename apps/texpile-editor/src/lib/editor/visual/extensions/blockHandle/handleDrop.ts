// a block handle drag drops beside the unit under the pointer (handleUnit.ts), before it in its upper half and after it
// in its lower half; ProseMirror's own spot is picked by character offset and lands inside wrappers
import { NodeSelection, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { handleUnitAt } from './handleUnit';

export type HandleDropState = { active: boolean; line: number | null };
type HandleDropMeta = { active: boolean } | { line: number | null };

export const blockHandlePluginKey = new PluginKey<HandleDropState>('block-handle');

export const handleDropState = {
	init: (): HandleDropState => ({ active: false, line: null }),
	apply(tr: Transaction, value: HandleDropState): HandleDropState {
		const meta = tr.getMeta(blockHandlePluginKey) as HandleDropMeta | undefined;
		if (meta && 'active' in meta) return { active: meta.active, line: null };
		if (meta) return { ...value, line: meta.line };
		return value.line !== null && tr.docChanged ? { ...value, line: tr.mapping.map(value.line) } : value;
	}
};

export function setHandleDragActive(view: EditorView, active: boolean) {
	if (blockHandlePluginKey.getState(view.state)?.active === active) return;
	view.dispatch(view.state.tr.setMeta(blockHandlePluginKey, { active }));
}

function dropLineElement(): HTMLElement {
	const line = document.createElement('div');
	line.className = 'pm-drop-cursor pm-handle-drop-line';
	line.contentEditable = 'false';
	return line;
}

export function handleDropLine(state: HandleDropState | undefined, doc: PMNode): DecorationSet | null {
	if (!state || state.line === null) return null;
	return DecorationSet.create(doc, [Decoration.widget(state.line, dropLineElement, { key: 'handle-drop-line', side: -1 })]);
}

/** where the dragged node goes for a pointer at (x, y), or null when the drop would change nothing */
function dropSpotAt(view: EditorView, node: PMNode, source: { from: number; to: number }, x: number, y: number): number | null {
	const box = view.dom.getBoundingClientRect();
	const unitPos = handleUnitAt(view, Math.min(Math.max(x, box.left + 1), box.right - 1), y);
	const { doc } = view.state;
	const unit = unitPos === null ? null : doc.nodeAt(unitPos);
	const dom = unitPos === null ? null : view.nodeDOM(unitPos);
	if (unitPos === null || !unit || !(dom instanceof HTMLElement)) return null;
	const rect = dom.getBoundingClientRect();
	const before = y < (rect.top + rect.bottom) / 2;
	let at = before ? unitPos : unitPos + unit.nodeSize;
	let $at = doc.resolve(at);
	// a parent that cannot take the node (a heading in a list item) gives the spot to the level above it
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
	if (blockHandlePluginKey.getState(view.state)?.line === line) return;
	view.dispatch(view.state.tr.setMeta(blockHandlePluginKey, { line }));
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
