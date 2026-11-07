// a change to a frame or a column itself leaves the blocks inside it as the file wrote them
import { adoptParse, containerOriginsOf, containerRecordAround } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** dispatches `change` to the node at `pos`; the node that replaces it is handed what the parse knew of its children
 *  before anything is written from it */
export function changeKeepingSource(view: EditorView, pos: number, old: Node, change: (tr: Transaction) => void): void {
	const tr = view.state.tr;
	change(tr);
	const fresh = tr.doc.nodeAt(pos);
	const record = containerOriginsOf(old) ?? containerRecordAround(old);
	if (fresh && record && fresh.type === old.type) adoptParse(fresh, record);
	view.dispatch(tr);
}
