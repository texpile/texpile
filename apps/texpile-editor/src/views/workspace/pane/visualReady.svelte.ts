// whether the pane's visual editor is built and on screen for the file it shows; the loading bar stays until it is
import { untrack } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';

type ReadyPane = {
	path: string | null;
	doc: PMNode | null | undefined;
	parked: boolean;
};

/** called during component init: it runs an effect. `shownDoc` is the document the live editor holds */
export function visualReady(pane: () => ReadyPane, shownDoc: () => PMNode | null | undefined) {
	// per path, so opening another file resets it for free
	let readyFor = $state<string | null>(null);
	$effect.pre(() => {
		const { path, doc, parked } = pane();
		if (!path) return;
		// a parked group's editor already shows its file, and a moved file keeps the editor that shows it: nothing is built
		if (parked || (doc && doc === untrack(shownDoc))) readyFor = path;
	});
	return {
		get ready(): boolean {
			const path = pane().path;
			return !!path && readyFor === path;
		},
		/** the editor reported its build on screen */
		built(path: string | null): void {
			readyFor = path;
		}
	};
}
