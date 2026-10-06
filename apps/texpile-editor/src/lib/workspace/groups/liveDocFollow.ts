// One file in two groups: the parked visual editor follows what the focused one types, by the
// smallest replace that turns its document into the other's. ProseMirror documents are immutable, so
// the focused editor's own nodes go across as they are, with no parse
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

const followers = new Map<string, Set<(doc: PMNode) => void>>();

/** the focused editor's document after an edit */
export function publishLiveDoc(path: string, doc: PMNode): void {
	for (const follow of followers.get(path) ?? []) follow(doc);
}

/** keeps `view` up with the focused editor on `path`; returns the unsubscribe */
export function followLiveDoc(path: string, view: () => EditorView | null): () => void {
	const follow = (doc: PMNode) => {
		const v = view();
		if (v && !v.isDestroyed) patchToDoc(v, doc);
	};
	const set = followers.get(path) ?? new Set();
	set.add(follow);
	followers.set(path, set);
	return () => {
		set.delete(follow);
		if (set.size === 0) followers.delete(path);
	};
}

/** marked as a collaborator's patch, so the editor does not send it back to the buffer as its own edit */
export function patchToDoc(view: EditorView, next: PMNode): void {
	const current = view.state.doc;
	const start = current.content.findDiffStart(next.content);
	if (start == null) return;
	const end = current.content.findDiffEnd(next.content);
	if (!end) return;
	let { a: endA, b: endB } = end;
	// a change inside a run of equal characters finds its end before its start
	const overlap = start - Math.min(endA, endB);
	if (overlap > 0) {
		endA += overlap;
		endB += overlap;
	}
	view.dispatch(
		view.state.tr.replace(start, endA, next.slice(start, endB)).setMeta('collabRemotePatch', true).setMeta('addToHistory', false)
	);
}
