// An editor pane's side of visualMountGuard: a file's first visual build is noted, and the note goes once
// that build is on screen, or when the pane leaves the file, stops building or goes away first, which is no crash
import { onDestroy } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';
import { noteVisualMount, visualMounted } from './visualMountGuard';

type MountNoteOptions = {
	doc: () => PMNode | null;
	path: () => string | null;
	/** a visual editor is about to be built for this file: not on screen yet */
	building: () => boolean;
};

export function visualMountNote(o: MountNoteOptions) {
	// keyed on the doc, not the path: the path switches a beat before the new doc arrives, and the old
	// doc under the new path is not a build
	let notedDoc: PMNode | null = null;
	let notedPath: string | null = null;
	$effect.pre(() => {
		const doc = o.doc();
		const path = o.path();
		// a pane that stops building before its editor shows (parked, or switched to Source) did not crash
		if (notedPath && (notedPath !== path || !o.building())) {
			visualMounted(notedPath);
			notedPath = null;
		}
		if (!doc || !path || !o.building() || doc === notedDoc) return;
		notedDoc = doc;
		notedPath = path;
		noteVisualMount(path);
	});
	onDestroy(() => {
		if (notedPath) visualMounted(notedPath);
	});
	return {
		/** the build is on screen */
		ready(path: string | null): void {
			if (path) visualMounted(path);
			notedPath = null;
		}
	};
}
