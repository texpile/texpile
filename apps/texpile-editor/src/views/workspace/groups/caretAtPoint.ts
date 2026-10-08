// The click that brought a parked group into focus fell on an editor that took no typing yet; it
// lands now, where it was made
import { TextSelection } from 'prosemirror-state';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';

/** where a click fell, or no point for focus that came from the keyboard */
export type GroupClick = { x: number; y: number; visual: boolean } | null;

/** false while the group's editor is not the app's yet */
export function caretAtPoint(click: GroupClick, cell: HTMLElement): boolean {
	const view = editorViewStore.current;
	const cm = sourceCmView.current;
	if (!click) {
		const editor = view && cell.contains(view.dom) ? view : cm && cell.contains(cm.dom) ? cm : null;
		editor?.focus();
		return !!editor;
	}
	if (click.visual) {
		if (!view || !cell.contains(view.dom)) return false;
		const at = view.posAtCoords({ left: click.x, top: click.y });
		if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
		view.focus();
		return true;
	}
	if (!cm || !cell.contains(cm.dom)) return false;
	const at = cm.posAtCoords({ x: click.x, y: click.y });
	if (at !== null) cm.dispatch({ selection: { anchor: at } });
	cm.focus();
	return true;
}

/** letters typed while the slot's editor was not the app's yet, at the caret the click put down */
export function typeAtCaret(text: string, cell: HTMLElement): void {
	const view = editorViewStore.current;
	const cm = sourceCmView.current;
	if (view && cell.contains(view.dom)) view.dispatch(view.state.tr.insertText(text).scrollIntoView());
	else if (cm && cell.contains(cm.dom)) cm.dispatch(cm.state.replaceSelection(text), { userEvent: 'input.type', scrollIntoView: true });
}
