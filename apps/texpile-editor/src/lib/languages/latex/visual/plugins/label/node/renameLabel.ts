import { announceLabelRenamed, labelTaken, repointRefs, sanitizeLabel } from '$lib/languages/latex/visual/core';
import type { EditorView } from 'prosemirror-view';

export function readLabelName(source: string): string | null {
	const name = /^\\label\{([^{}]*)\}$/.exec(source)?.[1];
	return name && sanitizeLabel(name) === name ? name : null;
}

export function setLabelName(view: EditorView, pos: number, name: string): void {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type.name !== 'label' || node.attrs.name === name || labelTaken(view.state.doc, name, pos)) return;
	view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, name }));
}

export function repointLabelRefs(view: EditorView, from: string, to: string): void {
	if (!from || from === to || sanitizeLabel(to) !== to) return;
	const tr = view.state.tr;
	repointRefs(tr, view.state.doc, from, to);
	if (tr.docChanged) view.dispatch(tr);
	announceLabelRenamed(from, to);
}
