// renaming a figure group's label, with every reference to it
import { announceLabelRenamed, labelTaken, repointRefs, sanitizeLabel } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

/** the label kept: a name another anchor holds is refused, an empty one takes the label away */
export function renameGroupLabel(view: EditorView, getPos: () => number | undefined, node: Node, typed: string): string {
	const pos = getPos();
	const from = String(node.attrs.label ?? '');
	const to = sanitizeLabel(typed);
	if (pos === undefined || to === from || (to && labelTaken(view.state.doc, to, pos))) return from;
	const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: to || null });
	if (from && to) repointRefs(tr, view.state.doc, from, to);
	view.dispatch(tr);
	if (from && to) announceLabelRenamed(from, to);
	return to;
}
