import type { Point } from '../figure/geometry';
import type { FigureEditorState } from '../state/editorState.svelte';
import { isEditorFocused } from '../state/keys/keyTargets';
import { copySelectionText, pasteText } from '../state/selection/pasteCommands';
import { deleteSelection } from '../state/selection/selectionCommands';

export function copyCanvasSelection(e: ClipboardEvent, ed: FigureEditorState, root: Element | undefined) {
	// text picked out on the page, a notice's message, is the page's to copy
	const text = isEditorFocused(root) && !document.getSelection()?.toString() ? copySelectionText(ed) : '';
	if (!text) return;
	e.clipboardData?.setData('text/plain', text);
	e.preventDefault();
}

export function cutCanvasSelection(e: ClipboardEvent, ed: FigureEditorState, root: Element | undefined) {
	copyCanvasSelection(e, ed, root);
	if (e.defaultPrevented) deleteSelection(ed);
}

/** `pointer` is where the pointer is on the canvas, in bp */
export function pasteOntoCanvas(e: ClipboardEvent, ed: FigureEditorState, root: Element | undefined, pointer: Point | null) {
	const text = isEditorFocused(root) ? e.clipboardData?.getData('text/plain') : '';
	if (!text) return;
	e.preventDefault();
	pasteText(ed, text, pointer);
}
