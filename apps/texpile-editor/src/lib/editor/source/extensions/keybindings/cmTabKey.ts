// Tab as VS Code has it: with nothing selected it indents at the caret, to the next indent stop;
// with a selection it indents the selected lines. CodeMirror's indentWithTab always indents the line
import { indentLess, indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { countColumn, EditorSelection } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';

export function indentAtCaret(view: EditorView): boolean {
	const { state } = view;
	if (state.readOnly) return false;
	if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
	const unit = state.facet(indentUnit);
	view.dispatch(
		state.update(
			state.changeByRange((range) => {
				const line = state.doc.lineAt(range.head);
				const column = countColumn(line.text.slice(0, range.head - line.from), state.tabSize);
				const insert = unit === '\t' ? '\t' : ' '.repeat(unit.length - (column % unit.length));
				return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) };
			}),
			{ scrollIntoView: true, userEvent: 'input.indent' }
		)
	);
	return true;
}

export const tabIndentBinding: KeyBinding = { key: 'Tab', run: indentAtCaret, shift: indentLess };
