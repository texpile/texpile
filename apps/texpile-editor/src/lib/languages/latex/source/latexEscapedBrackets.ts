// Auto-closing stops at a backslash: \{ \[ \( are LaTeX's own delimiters and \` is the grave
// accent, and the partner an auto-close would add is a character the document does not want.
// LaTeX Workshop carries the same exception.
import { EditorView } from '@codemirror/view';
import type { Extension, Text } from '@codemirror/state';

const OPENERS = new Set(['{', '[', '(', '`']);

/** the character at `pos` follows an odd run of backslashes, so it is escaped */
export function escapedAt(doc: Text, pos: number): boolean {
	let run = 0;
	while (pos - run > 0 && doc.sliceString(pos - run - 1, pos - run) === '\\') run++;
	return run % 2 === 1;
}

export function latexEscapedBrackets(): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		if (!OPENERS.has(text) || from !== to || view.state.selection.ranges.length !== 1) return false;
		if (!escapedAt(view.state.doc, from)) return false;
		view.dispatch(
			view.state.update({
				changes: { from, insert: text },
				selection: { anchor: from + text.length },
				userEvent: 'input.type',
				scrollIntoView: true
			})
		);
		return true;
	});
}
