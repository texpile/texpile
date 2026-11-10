// a slot a split brings up on the file the focused one shows opens scrolled and with the caret where that one is,
// as VS Code's split does; it is parked from the start, so nothing else would place it
import { untrack } from 'svelte';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { visualEditorIn } from '$lib/editor/editorsOnScreen.svelte';
import { carryCaret } from './splitCaret';

/** the element a slot's editor scrolls in: the source editor's, or the visual pane's */
function scrollerIn(cell: HTMLElement | undefined): HTMLElement | null {
	if (!cell) return null;
	const pm = cell.querySelector('.ProseMirror');
	return pm ? pm.closest<HTMLElement>('.overflow-auto') : cell.querySelector<HTMLElement>('.cm-scroller');
}

/** `cells` the slots' elements by id, `pathOf` the file a slot shows */
export function carrySplitViewState(cells: Map<number, HTMLElement>, pathOf: (id: number) => string | null): void {
	let known: Set<number> | null = null;
	$effect(() => {
		const ids = editorGroups.grid.map((g) => g.id);
		untrack(() => {
			const before = known;
			known = new Set(ids);
			if (!before) return;
			const from = editorGroups.focusedId;
			const fresh = ids.filter((id) => !before.has(id) && pathOf(id) && pathOf(id) === pathOf(from));
			if (fresh.length) place(from, fresh, 0);
		});
	});

	// the new slot's editor is built a few frames on: try for about half a second, then leave it where it is
	function place(from: number, fresh: number[], tries: number): void {
		requestAnimationFrame(() => {
			const source = cells.get(from);
			const top = scrollerIn(source)?.scrollTop ?? 0;
			const splitFrom = visualEditorIn(source ?? null);
			const waiting = fresh.filter((id) => {
				const cell = cells.get(id);
				const el = scrollerIn(cell);
				if (!el || el.scrollHeight < top + el.clientHeight) return true;
				el.scrollTop = top;
				const view = visualEditorIn(cell ?? null);
				// a slot already clicked or typed in keeps the caret the writer gave it
				if (splitFrom && view && editorGroups.focusedId !== id) carryCaret(splitFrom, view);
				return false;
			});
			if (waiting.length && tries < 30) place(from, waiting, tries + 1);
		});
	}
}
