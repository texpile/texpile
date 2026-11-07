import { NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { placeholderCommand } from './placeholderView';

export const placeholderCaret = new Plugin({
	appendTransaction(transactions, _old, state) {
		if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
		const { selection } = state;
		const { $from } = selection;
		if (!(selection instanceof TextSelection) || $from.parent.type.name !== 'raw_latex') return null;
		const command = placeholderCommand($from.parent.textContent)?.command;
		if (!command || command === 'printbibliography') return null;
		return state.tr.setSelection(NodeSelection.create(state.doc, $from.before()));
	}
});
