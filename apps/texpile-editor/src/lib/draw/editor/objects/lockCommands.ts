import type { FigureEditorState } from '../state/editorState.svelte';

/** locked, they leave the selection; unlocked, they are the selection, as Excalidraw's lock does */
export function toggleLocked(ed: FigureEditorState, ids: number[]) {
	if (!ids.length) return;
	const locking = ids.some((i) => !ed.flags.locked.includes(i));
	ed.flags.set('locked', ids, locking);
	ed.selectMany(locking ? ed.selection.filter((i) => !ids.includes(i)) : ids);
}
