import { announceLabelRenamed, labelTaken, repointRefs, sanitizeLabel } from '$lib/languages/latex/visual/core';
import type { EditorView } from 'prosemirror-view';

/** the name a typed `\label{name}` reads back as, when it is one valid name */
export function readLabelName(source: string): string | null {
	const name = /^\\label\{([^{}]*)\}$/.exec(source)?.[1];
	return name && sanitizeLabel(name) === name ? name : null;
}

/** a name another anchor holds is refused: the references would survive, pointing somewhere else */
export function setLabelName(view: EditorView, pos: number, name: string): void {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type.name !== 'label' || node.attrs.name === name || labelTaken(view.state.doc, name, pos)) return;
	view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, name }));
}

/** run once when the panel closes, so a name typed over many edits moves the references once */
export function repointLabelRefs(view: EditorView, from: string, to: string): void {
	if (!from || from === to || sanitizeLabel(to) !== to) return;
	const tr = view.state.tr;
	repointRefs(tr, view.state.doc, from, to);
	if (tr.docChanged) view.dispatch(tr);
	announceLabelRenamed(from, to);
}
