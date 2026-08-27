import type { EditorView } from 'prosemirror-view';
import { sanitizeLabel } from '$lib/editor/visual/label';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { repointRefs } from '$lib/editor/visual/repointRefs';

/**
 * Renames a label AND every reference pointing at it, in ONE transaction.
 *
 * Renaming the anchor alone would break each \ref silently - the source still compiles, with every
 * reference to it resolving to ?? - so the rename either takes the references with it or does not
 * happen. A name another anchor already holds is refused for the same reason: the references would
 * survive, pointing somewhere else.
 */
export function renameLabel(view: EditorView, pos: number, to: string): void {
	const node = view.state.doc.nodeAt(pos);
	if (!node || node.type.name !== 'label') return;

	const from = String(node.attrs.name ?? '');
	const name = sanitizeLabel(to);
	if (!name || name === from) return;
	if (labelTaken(view.state.doc, name, pos)) return;

	const tr = view.state.tr;
	tr.setNodeMarkup(pos, null, { ...node.attrs, name });
	repointRefs(tr, view.state.doc, from, name);

	view.dispatch(tr);
}
