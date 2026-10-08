import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { tocStore, tocCaretStore, type TocItem } from './tocStore';
import { trailingDebounce } from '$lib/trailingDebounce';

function collectHeadings(doc: Node): TocItem[] {
	const items: TocItem[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			items.push({ level: Number(node.attrs.level ?? 1), text: node.textContent, pos });
		}
	});
	return items;
}

/** Keeps `tocStore` in sync with the document's headings (for the right-rail table of contents).
 * Display-only, so the full-doc walk runs debounced instead of per transaction. Only the focused
 * editor's: a parked one shows another slot's file */
export function createTocPlugin() {
	const deferredCollect = trailingDebounce(300, (doc: Node) => (tocStore.current = collectHeadings(doc)));
	return new Plugin({
		view: (view) => {
			let collected: Node | null = null;
			function sync(v: EditorView): void {
				if (!v.editable) {
					collected = null;
					return;
				}
				if (collected === null) tocStore.current = collectHeadings(v.state.doc);
				else if (collected !== v.state.doc) deferredCollect(v.state.doc);
				collected = v.state.doc;
				const head = v.state.selection.head;
				if (tocCaretStore.current !== head) tocCaretStore.current = head;
			}
			sync(view);
			return {
				update: sync,
				// a timer outliving this editor would overwrite the NEXT document's TOC
				destroy: () => {
					if (!view.editable) return;
					deferredCollect.cancel();
					tocCaretStore.current = null;
				}
			};
		}
	});
}
