import { Plugin } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { pasteBesideTable } from '$lib/editor/paste/block/blockBesideTable';
import { generateCopySuffix } from '$lib/editor/visual/label';

// appends '-copy-{uuid}' to labels on pasted tables/images/equations and inline \label nodes that the document still
// holds outside the pasted range. \ref nodes are left pointing at the original.

const LABEL_ATTR: Record<string, string> = { table_wrapper: 'label', image: 'label', block_math: 'label', label: 'name' };

function generateCopyLabel(originalLabel: string): string {
	const shortId = generateCopySuffix();
	return `${originalLabel}-copy-${shortId}`;
}

function processNode(node: Node, taken: ReadonlySet<string>): Node {
	const attr = LABEL_ATTR[node.type.name];
	if (attr && taken.has(node.attrs[attr])) {
		const newContent = processFragment(node.content, taken);
		return node.type.create({ ...node.attrs, [attr]: generateCopyLabel(node.attrs[attr]) }, newContent, node.marks);
	}

	if (node.content.size > 0) {
		const newContent = processFragment(node.content, taken);
		return node.type.create(node.attrs, newContent, node.marks);
	}

	return node;
}

function processFragment(fragment: Fragment, taken: ReadonlySet<string>): Fragment {
	const nodes: Node[] = [];

	fragment.forEach((node) => {
		nodes.push(processNode(node, taken));
	});

	return Fragment.from(nodes);
}

function labelsOutside(doc: Node, from: number, to: number): Set<string> {
	const labels = new Set<string>();
	doc.descendants((node, pos) => {
		if (pos >= from && pos + node.nodeSize <= to) return false;
		const attr = LABEL_ATTR[node.type.name];
		if (attr && node.attrs[attr]) labels.add(node.attrs[attr]);
		return true;
	});
	return labels;
}

/** relabel pasted tables/images/equations/labels whose label the document keeps outside the range the paste replaces.
 *  Exported for the LaTeX-paste path, which bypasses this plugin's handlePaste. */
export function regenerateCopiedLabels(slice: Slice, view: EditorView): Slice {
	const { from, to } = view.state.selection;
	const newContent = processFragment(slice.content, labelsOutside(view.state.doc, from, to));
	return new Slice(newContent, slice.openStart, slice.openEnd);
}

export const pasteUuidFixPlugin = new Plugin({
	props: {
		// returning true skips default paste handling AND transformPasted
		handlePaste(view, event, slice) {
			const modifiedSlice = regenerateCopiedLabels(slice, view);
			const tr = pasteBesideTable(view.state, modifiedSlice) ?? view.state.tr.replaceSelection(modifiedSlice);
			view.dispatch(tr);
			return true;
		},

		// only reached for drag-drop; leave labels alone so reordering doesn't rename them
		transformPasted(slice) {
			return slice;
		}
	}
});
