// Every editor drawn, whichever slot it is in, so a pane finds the ones inside it: the comment margin
// measures against its own editor, not the app's focused one
import { SvelteSet } from 'svelte/reactivity';
import type { EditorView as PMView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';

const visual = new SvelteSet<PMView>();
const source = new SvelteSet<CMView>();

export function showVisualEditor(view: PMView): () => void {
	visual.add(view);
	return () => visual.delete(view);
}

export function showSourceEditor(view: CMView): () => void {
	source.add(view);
	return () => source.delete(view);
}

export function visualEditorIn(el: Element | null): PMView | null {
	if (!el) return null;
	for (const v of visual) if (el.contains(v.dom)) return v;
	return null;
}

export function sourceEditorIn(el: Element | null): CMView | null {
	if (!el) return null;
	for (const v of source) if (el.contains(v.dom)) return v;
	return null;
}
