// prosemirror-view's handleDrop on the canvas: the dragged slice, or the dropped data read as a paste, put at the drop point
import { Slice, type ResolvedPos } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import { dropPoint } from 'prosemirror-transform';
import { isMac } from '$lib/platform';
import type { ViewDragging, VisualView } from '../../contracts/viewTypes';
import { clipboardText } from '../clipboard/pasteSlice';
import { parseFromClipboard } from '../clipboard/pmClipboard';

/** a drag moves unless dragCopies says it copies, or Alt (macOS) or Ctrl is held */
export function dragMoves(view: VisualView, event: DragEvent, mac = isMac): boolean {
	let copy: boolean | undefined;
	view.someProp('dragCopies', (test) => void (copy = copy || test(event)));
	return copy != null ? !copy : !(mac ? event.altKey : event.ctrlKey);
}

function selectionBetween(view: VisualView, $from: ResolvedPos, $to: ResolvedPos): Selection {
	return view.someProp('createSelectionBetween', (f) => f(view, $from, $to)) ?? TextSelection.between($from, $to);
}

/** where a drop at this client point lands, or null off the document */
export function dropPosAt(view: VisualView, client: { x: number; y: number }): number | null {
	return view.posAtCoords({ left: client.x, top: client.y })?.pos ?? null;
}

/** the slice a drag carries: the dragged one, else the dropped data read as a paste at the place */
export function droppedSlice(view: VisualView, event: DragEvent, dragging: ViewDragging | null, at: number): Slice | null {
	const transfer = event.dataTransfer;
	let slice: Slice | null = dragging?.slice ?? null;
	if (slice) view.someProp('transformPasted', (f) => void (slice = f(slice!, view, false)));
	else if (transfer)
		slice = parseFromClipboard(view, clipboardText(transfer), transfer.getData('text/html'), false, view.state.doc.resolve(at));
	return slice;
}

/** `at` is the document place under the drop (dropPosAt) */
export function dropSlice(view: VisualView, event: DragEvent, dragging: ViewDragging | null, at: number): void {
	if (!event.dataTransfer) return;
	const slice = droppedSlice(view, event, dragging, at);
	const move = !!dragging && dragMoves(view, event);
	if (view.someProp('handleDrop', (f) => f(view, event, slice ?? Slice.empty, move))) {
		event.preventDefault();
		return;
	}
	if (!slice) return;
	event.preventDefault();
	const insertPos = dropPoint(view.state.doc, at, slice) ?? at;
	const tr = view.state.tr;
	if (move) {
		if (dragging!.node) dragging!.node.replace(tr);
		else tr.deleteSelection();
	}
	const pos = tr.mapping.map(insertPos);
	const isNode = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
	const before = tr.doc;
	if (isNode) tr.replaceRangeWith(pos, pos, slice.content.firstChild!);
	else tr.replaceRange(pos, pos, slice);
	if (tr.doc.eq(before)) return;
	const $pos = tr.doc.resolve(pos);
	if (isNode && NodeSelection.isSelectable(slice.content.firstChild!) && $pos.nodeAfter?.sameMarkup(slice.content.firstChild!)) {
		tr.setSelection(new NodeSelection($pos));
	} else {
		let end = tr.mapping.map(insertPos);
		tr.mapping.maps[tr.mapping.maps.length - 1].forEach((_from, _to, _newFrom, newTo) => (end = newTo));
		tr.setSelection(selectionBetween(view, $pos, tr.doc.resolve(end)));
	}
	view.focus();
	view.dispatch(tr.setMeta('uiEvent', 'drop'));
}
