// the numbers `@label` prints, read off the document and kept per editor for the references that show them
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { untrack } from 'svelte';
import { windowInvalidation } from '$lib/editor/canvas';
import { ownNumbersOf, referenceStore, type LabelNumber } from '$lib/languages/typst/visual/core';

export type RefNumbers = { labels: Map<string, LabelNumber> | null };

class RefNumbersStore implements RefNumbers {
	labels = $state<Map<string, LabelNumber> | null>(null);
	private key = '';

	read(view: EditorView): void {
		const labels = ownNumbersOf(view.state.doc)?.labels ?? null;
		const key = JSON.stringify(labels ? [...labels] : null);
		if (this.key === key) return;
		this.key = key;
		this.labels = labels;
		relayReferences(view);
	}
}

const stores = new WeakMap<EditorView, RefNumbersStore>();

// the canvas draws a reference from these numbers and the bibliography: either changing draws the visible ones again
function relayReferences(view: EditorView): void {
	const win = view.dom.ownerDocument.defaultView;
	if (win) windowInvalidation(win).fire({ kind: 'store', name: 'typstNames' });
}

function storeFor(view: EditorView): RefNumbersStore {
	const known = stores.get(view);
	if (known) return known;
	const store = new RefNumbersStore();
	stores.set(view, store);
	store.read(view);
	return store;
}

export function refNumbersOf(view: EditorView): RefNumbers {
	return storeFor(view);
}

export const refNumbersPlugin = new Plugin({
	view(view) {
		storeFor(view);
		const stop = $effect.root(() => {
			$effect(() => {
				void referenceStore.current;
				untrack(() => relayReferences(view));
			});
		});
		return {
			update(next, previous) {
				if (next.state.doc !== previous.doc) storeFor(next).read(next);
			},
			destroy: stop
		};
	}
});
