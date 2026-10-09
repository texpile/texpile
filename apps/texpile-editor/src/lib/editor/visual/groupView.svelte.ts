// A visual editor in an editor slot. The focused slot's is the app's editor, the one editorViewStore
// names, and it takes typing; a parked slot's takes none, and follows its file wherever it changes
import { untrack } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import { editorViewStore } from '$lib/stores/editorStore';
import { followFile } from '$lib/workspace/groups/fileFeed.svelte';
import { showVisualEditor } from '$lib/editor/editorsOnScreen.svelte';

type GroupViewOptions = { view: () => EditorView | null; live: () => boolean; path: () => string | null };

export function groupView(o: GroupViewOptions) {
	let live = untrack(o.live);
	// the pane's props arrive spread, so reading one tracks all of them; these pass on only a real change
	const isLive = $derived(o.live());
	const path = $derived(o.path());
	$effect(() => {
		const v = o.view();
		return v ? showVisualEditor(v) : undefined;
	});
	$effect(() => {
		const v = o.view();
		live = isLive;
		const followed = path;
		if (!v) return;
		return untrack(() => {
			// ProseMirror reads a read-only editor's DOM selection too, and Chrome collapses it as editing turns off:
			// the slot's range would come back a caret. The range stays drawn (persistentSelection)
			const domSelection = v.dom.ownerDocument.getSelection();
			if (!live && domSelection?.anchorNode && v.dom.contains(domSelection.anchorNode)) domSelection.removeAllRanges();
			// re-reads `editable`, which flips contenteditable
			v.setProps({});
			if (live) {
				editorViewStore.current = v;
				return undefined;
			}
			// parked: what acts on the app's editor (a mode switch's anchor, the menus) must not land here
			if (editorViewStore.current === v) editorViewStore.current = null;
			return followed ? followFile(followed, o.view) : undefined;
		});
	});
	return {
		editable: () => live,
		/** at mount, before anything reads the store: only the focused slot's editor is the app's */
		claim(v: EditorView): void {
			if (live) editorViewStore.current = v;
		},
		release(v: EditorView | null): void {
			if (v && editorViewStore.current === v) editorViewStore.current = null;
		}
	};
}
