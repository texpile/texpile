// a list node the editor makes carries only `kind` (flat-list's split copies nothing else), so
// it takes the marker and looseness of the list it was made in; the serializer would otherwise
// write it as a new list under the default marker
import { Plugin } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { listFamily } from './serialize/listAttrs';

function donorFor(parent: Node, index: number, node: Node): Node | null {
	const kind = String(node.attrs.kind ?? 'bullet');
	for (const i of [index - 1, index + 1]) {
		if (i < 0 || i >= parent.childCount) continue;
		const sib = parent.child(i);
		if (sib.type.name !== 'list' || sib.attrs.marker == null) continue;
		if (kind === 'task' || listFamily(sib) === kind) return sib;
	}
	return null;
}

export const listAttrInheritance = new Plugin({
	appendTransaction(transactions, _old, state) {
		if (!transactions.some((tr) => tr.docChanged)) return null;
		const tr = state.tr;
		let changed = false;
		state.doc.descendants((node, pos, parent, index) => {
			if (node.type.name !== 'list') return node.type.name === 'blockquote';
			if (node.attrs.marker == null && parent) {
				const donor = donorFor(parent, index, node);
				if (donor) {
					tr.setNodeMarkup(pos, undefined, { ...node.attrs, marker: donor.attrs.marker, loose: donor.attrs.loose });
					changed = true;
				}
			}
			return true;
		});
		return changed ? tr : null;
	}
});
