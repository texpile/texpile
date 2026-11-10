// Tab as VS Code has it: with nothing selected it indents at the caret, to the next indent stop;
// with a selection it indents the selected lines. CodeMirror's indentWithTab always indents the line
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete';
import { indentLess, indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { countColumn, EditorSelection, Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView, type KeyBinding } from '@codemirror/view';

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

/** Tab takes the selected completion as Enter does, in a snippet field too; mount it before the snippet keymap */
export const tabAcceptsCompletion: Extension = [
	Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
	// accepted at once, as VS Code does: CodeMirror's 75 ms wait turned a quick Tab into a jump to the next field
	autocompletion({ interactionDelay: 0 })
];
