// \maketitle and the like draw a face with no text a caret can stand in: a caret moved into one (an arrow from a gap
// cursor) takes the block whole, as a click on the face does
import { NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { placeholderCommand } from './placeholderView';

export const placeholderCaret = new Plugin({
	appendTransaction(transactions, _old, state) {
		if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
		const { selection } = state;
		const { $from } = selection;
		if (!(selection instanceof TextSelection) || $from.parent.type.name !== 'raw_latex') return null;
		const command = placeholderCommand($from.parent.textContent)?.command;
		// \printbibliography has a view of its own
		if (!command || command === 'printbibliography') return null;
		return state.tr.setSelection(NodeSelection.create(state.doc, $from.before()));
	}
});
