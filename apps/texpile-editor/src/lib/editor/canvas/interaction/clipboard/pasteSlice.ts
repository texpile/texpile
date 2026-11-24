// prosemirror-view's paste (doPaste in PMV/input.ts), for paste events, view.pasteText and view.pasteHTML
import { Slice, type Node as PMNode } from 'prosemirror-model';
import type { ViewInputFacts, VisualView } from '../../contracts/viewTypes';
import { parseFromClipboard } from './pmClipboard';

/** Ctrl+Shift+V pastes plain; Shift+Insert is a normal paste */
export function pastesPlain(input: ViewInputFacts): boolean {
	return input.shiftKey && input.lastKeyCode !== 45;
}

/** text/plain, else Text, else the links of text/uri-list on one line */
export function clipboardText(transfer: DataTransfer): string {
	const text = transfer.getData('text/plain') || transfer.getData('Text');
	if (text) return text;
	const uris = transfer.getData('text/uri-list');
	return uris ? uris.replace(/\r?\n/g, ' ') : '';
}

function singleNodeOf(slice: Slice): PMNode | null {
	return slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
}

/** false when there was nothing to read and no handlePaste took the event */
export function pasteSlice(view: VisualView, text: string, html: string | null, preferPlain: boolean, event: ClipboardEvent): boolean {
	const slice = parseFromClipboard(view, text, html, preferPlain, view.state.selection.$from);
	if (view.someProp('handlePaste', (f) => f(view, event, slice || Slice.empty))) return true;
	if (!slice) return false;
	const single = singleNodeOf(slice);
	const tr = single ? view.state.tr.replaceSelectionWith(single, preferPlain) : view.state.tr.replaceSelection(slice);
	view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
	return true;
}
