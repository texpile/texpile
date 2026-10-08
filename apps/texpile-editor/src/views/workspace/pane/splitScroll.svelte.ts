// a slot a split brings up on the file the focused one shows opens scrolled where that one is, as VS Code's split
// does; it is parked from the start, so nothing else would place it
import { untrack } from 'svelte';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';

/** the element a slot's editor scrolls in: the source editor's, or the visual pane's */
function scrollerIn(cell: HTMLElement | undefined): HTMLElement | null {
	if (!cell) return null;
	const pm = cell.querySelector('.ProseMirror');
	return pm ? pm.closest<HTMLElement>('.overflow-auto') : cell.querySelector<HTMLElement>('.cm-scroller');
}

/** `cells` the slots' elements by id, `pathOf` the file a slot shows */
export function followSplitScroll(cells: Map<number, HTMLElement>, pathOf: (id: number) => string | null): void {
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
			const top = scrollerIn(cells.get(from))?.scrollTop ?? 0;
			const waiting = fresh.filter((id) => {
				const el = scrollerIn(cells.get(id));
				if (!el || el.scrollHeight < top + el.clientHeight) return true;
				el.scrollTop = top;
				return false;
			});
			if (waiting.length && tries < 30) place(from, waiting, tries + 1);
		});
	}
}
