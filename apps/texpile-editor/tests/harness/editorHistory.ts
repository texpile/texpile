import { undo, redo } from 'prosemirror-history';
import { bindVisualUndo } from '$lib/editor/visual/visualUndo';
import { editorViewStore } from '$lib/stores/editorStore';

/** undo and redo step the editor's own history; the file's text history (disk and source steps) needs the workspace */
export function bindEditorHistory(): void {
	bindVisualUndo((direction) => {
		const view = editorViewStore.current;
		return !!view && (direction === 'undo' ? undo : redo)(view.state, view.dispatch);
	});
}
