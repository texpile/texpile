// An editor window coming forward gives its slot focus. A beat later: a click that brought it forward lands through
// the slot's own press, which puts the caret where it fell
import { untrack } from 'svelte';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';

/** called during component init: it runs effects. `keyboard` puts the typing into a slot's editor */
export function windowFocus(keyboard: (id: number) => void) {
	// a window whose file closed (Ctrl+W, the file deleted) goes with it
	$effect(() => {
		const empty = editorGroups.list.filter((g) => g.window && editorGroups.tabsOf(g.id).length === 0);
		untrack(() => {
			for (const g of empty) editorGroups.removeWindow(g.id);
		});
	});

	return {
		focusSoon(id: number): void {
			setTimeout(() => {
				if (editorGroups.focusedId === id || !editorGroups.list.some((g) => g.id === id)) return;
				editorGroups.focus(id);
				keyboard(id);
			}, 50);
		}
	};
}
