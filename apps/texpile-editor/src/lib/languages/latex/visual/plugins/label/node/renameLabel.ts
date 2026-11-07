import { announceLabelRenamed, labelTaken, repointRefs, sanitizeLabel } from '$lib/languages/latex/visual/core';
import type { EditorView } from 'prosemirror-view';

export function readLabelName(source: string): string | null {
	const name = /^\\label\{([^{}]*)\}$/.exec(source)?.[1];
	return name && sanitizeLabel(name) === name ? name : null;
}

/** the label and its references in one step, so no state of the document has them apart */
export function setLabelName(view: EditorView, pos: number, name: string): void {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type.name !== 'label' || node.attrs.name === name || labelTaken(view.state.doc, name, pos)) return;
	const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, name });
	repointRefs(tr, view.state.doc, String(node.attrs.name ?? ''), name);
	view.dispatch(tr);
}

// once per panel, so the other files take one rename for a name typed over many edits
export function announceLabelMove(from: string, to: string): void {
	if (sanitizeLabel(to) === to) announceLabelRenamed(from, to);
}
