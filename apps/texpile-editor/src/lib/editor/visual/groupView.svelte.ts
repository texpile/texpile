// A visual editor in an editor group. The focused group's is the app's editor, the one editorViewStore
// names, and it takes typing; a parked group's takes none, and follows the focused one when both
// show one file
import { untrack } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import { editorViewStore } from '$lib/stores/editorStore';
import { followLiveDoc } from '$lib/workspace/groups/liveDocFollow';

type GroupViewOptions = { view: () => EditorView | null; live: () => boolean; path: () => string | null };

const views = new WeakMap<Element, EditorView>();

/** the visual editor drawn inside `el`, for a group about to take focus */
export function visualViewIn(el: Element): EditorView | null {
	const dom = el.querySelector('.ProseMirror');
	return dom ? (views.get(dom) ?? null) : null;
}

export function groupView(o: GroupViewOptions) {
	let live = untrack(o.live);
	// the pane's props arrive spread, so reading one tracks all of them; these pass on only a real change
	const isLive = $derived(o.live());
	const path = $derived(o.path());
	$effect(() => {
		const v = o.view();
		live = isLive;
		const followed = path;
		if (!v) return;
		views.set(v.dom, v);
		return untrack(() => {
			// re-reads `editable`, which flips contenteditable
			v.setProps({});
			if (live) {
				editorViewStore.current = v;
				return undefined;
			}
			return followed ? followLiveDoc(followed, o.view) : undefined;
		});
	});
	return {
		editable: () => live,
		/** at mount, before anything reads the store: only the focused group's editor is the app's */
		claim(v: EditorView): void {
			if (live) editorViewStore.current = v;
		},
		release(v: EditorView | null): void {
			if (v && editorViewStore.current === v) editorViewStore.current = null;
		}
	};
}
