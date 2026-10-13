import { EditorState, NodeSelection, Transaction } from 'prosemirror-state';

export function createMathField(createblock = false) {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const { from, to } = state.selection;

		if (createblock) {
			// state.schema, not the tex schema import: this command serves both editors, and
			// nodes from different Schema objects must never mix in one doc
			const newNode = state.schema.nodes.block_math.create({}, state.schema.text(' '));

			const $from = state.doc.resolve(from);
			const parent = $from.parent;

			if (parent.type.name === 'paragraph' && parent.content.size === 0) {
				const tr = state.tr.replaceRangeWith($from.before(), $from.after(), newNode);
				const nodeSelection = NodeSelection.create(tr.doc, $from.before());
				tr.setSelection(nodeSelection);
				dispatch?.(tr);
				return true;
			} else if (parent.type.name === 'paragraph' && parent.content.size > 0) {
				const tr = state.tr.insert($from.after(), newNode);
				const nodeSelection = NodeSelection.create(tr.doc, $from.after());
				tr.setSelection(nodeSelection);
				dispatch?.(tr);
				return true;
			} else {
				const tr = state.tr.replaceRangeWith(from, to, newNode);
				const nodeSelection = NodeSelection.create(tr.doc, from);
				tr.setSelection(nodeSelection);
				dispatch?.(tr);
				return true;
			}
		} else {
			const newNode = state.schema.nodes.inline_math.create({}, state.schema.text(' '));
			const $from = state.doc.resolve(from);

			if ($from.parent.canReplaceWith($from.index(), $from.index(), newNode.type)) {
				const tr = state.tr.insert(from, newNode);
				const nodeSelection = NodeSelection.create(tr.doc, from);
				tr.setSelection(nodeSelection);
				dispatch?.(tr);
				return true;
			}
		}

		return false;
	};
}
