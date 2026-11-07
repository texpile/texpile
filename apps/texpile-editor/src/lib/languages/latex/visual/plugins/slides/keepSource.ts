import { adoptParse, containerOriginsOf, containerRecordAround } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export function changeKeepingSource(view: EditorView, pos: number, old: Node, change: (tr: Transaction) => void): void {
	const tr = view.state.tr;
	change(tr);
	const fresh = tr.doc.nodeAt(pos);
	const record = containerOriginsOf(old) ?? containerRecordAround(old);
	if (fresh && record && fresh.type === old.type) adoptParse(fresh, record);
	view.dispatch(tr);
}
