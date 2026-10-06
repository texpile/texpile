// The click that brought a parked group into focus fell on an editor that took no typing yet; it
// lands now, where it was made
import { TextSelection } from 'prosemirror-state';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';

export type GroupClick = { x: number; y: number; visual: boolean };

/** false while the group's editor is not the app's yet */
export function caretAtPoint(click: GroupClick, cell: HTMLElement): boolean {
	if (click.visual) {
		const view = editorViewStore.current;
		if (!view || !cell.contains(view.dom)) return false;
		const at = view.posAtCoords({ left: click.x, top: click.y });
		if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
		view.focus();
		return true;
	}
	const cm = sourceCmView.current;
	if (!cm || !cell.contains(cm.dom)) return false;
	const at = cm.posAtCoords({ x: click.x, y: click.y });
	if (at !== null) cm.dispatch({ selection: { anchor: at } });
	cm.focus();
	return true;
}
