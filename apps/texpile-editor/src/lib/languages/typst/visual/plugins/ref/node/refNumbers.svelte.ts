// the numbers `@label` prints, read off the document and kept per editor for the references that show them
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { collectLabelNumbers, type LabelNumber } from './labelNumbers';

export type RefNumbers = { labels: Map<string, LabelNumber> | null };

class RefNumbersStore implements RefNumbers {
	labels = $state<Map<string, LabelNumber> | null>(null);
	private key = '';

	// a keystroke that moves no number leaves every reference as it is
	read(view: EditorView): void {
		const labels = collectLabelNumbers(view.state.doc);
		const key = JSON.stringify(labels ? [...labels] : null);
		if (this.key === key) return;
		this.key = key;
		this.labels = labels;
	}
}

const stores = new WeakMap<EditorView, RefNumbersStore>();

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
		return {
			update(next, previous) {
				if (next.state.doc !== previous.doc) storeFor(next).read(next);
			}
		};
	}
});
