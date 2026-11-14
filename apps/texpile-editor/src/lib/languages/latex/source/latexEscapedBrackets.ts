// Auto-closing stops at a backslash: \{ \[ \( are LaTeX's own delimiters, \` is the grave accent and \$ a dollar
// sign, and the partner an auto-close would add is a character the document does not want. LaTeX Workshop carries
// the same exception. A second `$` typed after one makes $$, display math's own mark, and takes no partner either.
import { EditorView } from '@codemirror/view';
import type { Extension, Text } from '@codemirror/state';

const OPENERS = new Set(['{', '[', '(', '`', '$']);

/** the character at `pos` follows an odd run of backslashes, so it is escaped */
export function escapedAt(doc: Text, pos: number): boolean {
	let run = 0;
	while (pos - run > 0 && doc.sliceString(pos - run - 1, pos - run) === '\\') run++;
	return run % 2 === 1;
}

export function latexEscapedBrackets(): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		if (!OPENERS.has(text) || from !== to || view.state.selection.ranges.length !== 1) return false;
		const { doc } = view.state;
		// before the partner of a `$` just typed the key steps over it, which is closeBrackets' to do
		const secondDollar = text === '$' && doc.sliceString(from - 1, from) === '$' && doc.sliceString(from, from + 1) !== '$';
		if (!escapedAt(doc, from) && !secondDollar) return false;
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
