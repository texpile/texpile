// Enter inside a list item opens the next item. Without it a writer types the whole `\item`
// by hand, and the buffer passes through `\`, `\i`, `\it` on the way -- measured as a run of
// tinted patches followed by a full recompile the moment `\item` becomes a command.
//
// Every judgement lives in openListAt; this binds it to a key and does nothing else. It
// returns false whenever the answer is not obviously yes, so Enter keeps its normal behaviour.
import { keymap, type EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { openListAt, inInlineMath, itemLineAbove } from './openListAt';

/** exported for the view-level test: the keymap below is its only production caller */
export function continueList(view: EditorView): boolean {
	const { state } = view;
	// one caret, nothing selected: a multi-cursor or a selection replacement is a different
	// edit and none of the reasoning below holds for it
	if (state.selection.ranges.length !== 1) return false;
	const range = state.selection.main;
	if (!range.empty) return false;

	const pos = range.head;
	const line = state.doc.lineAt(pos);
	if (inInlineMath(line.text, pos - line.from)) return false;

	const doc = state.doc.toString();
	const open = openListAt(doc, pos);
	if (!open) return false;

	// second, independent reading: the document scan says which environment the caret is in,
	// this says the caret is plainly at the end of a bullet. Both have to agree, so a scan
	// confused by a malformed buffer cannot put an \item somewhere absurd on its own.
	if (!itemLineAbove(doc.split('\n'), state.doc.lineAt(pos).number - 1)) return false;

	// an item with nothing in it yet: Enter there means "I am done with this list", which is
	// what every editor does, and adding a second empty bullet would be the opposite
	if (!doc.slice(open.itemAt, pos).trim()) return false;

	// the indent of the line the item STARTS on, so a nested list keeps its shape
	const indent = /^[ \t]*/.exec(state.doc.lineAt(open.itemAt).text)![0];
	const insert = `\n${indent}\\item `;
	view.dispatch({
		changes: { from: pos, to: range.anchor, insert },
		selection: { anchor: pos + insert.length },
		scrollIntoView: true,
		userEvent: 'input'
	});
	return true;
}

export function latexListContinuation(): Extension {
	return keymap.of([{ key: 'Enter', run: continueList }]);
}
