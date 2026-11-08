// Typst source-mode CodeMirror chords - the typst sibling of markdown/sourceExtensions.ts. The
// commands are the same pure computations TypstSourceToolbar already clicks, so a chord and its
// button produce identical edits; only the trigger differs.
//
// The commands are Typst visual mode's, on the same keys, so muscle memory survives a mode switch. No link command:
// Mod-k is the command palette's everywhere, and a link here opened the palette over the edit.
import type { EditorView } from '@codemirror/view';
import { cmCommandKeys } from '$lib/keybindings/editors/cmCommandKeys';
import type { Extension, TransactionSpec, EditorState } from '@codemirror/state';
import { computeToggleDelim, computeWrap, computeHeadingLine, computeFence, computeMathBlock } from './sourceInsert';

function run(build: (state: EditorState) => TransactionSpec) {
	return (view: EditorView): boolean => {
		view.dispatch(build(view.state));
		return true;
	};
}

export function typSourceShortcuts(): Extension {
	return cmCommandKeys({
		// * and _ are Typst's own strong/emphasis delimiters; the rest have no shorthand and go
		// through the function form the visual serializer also emits.
		'editor.bold': run((s) => computeToggleDelim(s, '*')),
		'editor.italic': run((s) => computeToggleDelim(s, '_')),
		'editor.underline': run((s) => computeWrap(s, '#underline[', ']')),
		'editor.inlineCode': run((s) => computeToggleDelim(s, '`')),
		'editor.superscript': run((s) => computeWrap(s, '#super[', ']')),
		'editor.subscript': run((s) => computeWrap(s, '#sub[', ']')),
		'editor.inlineMath': run((s) => computeToggleDelim(s, '$')),
		'editor.displayMath': run(computeMathBlock),
		'editor.blockquote': run((s) => computeWrap(s, '#quote(block: true)[', ']')),
		'editor.codeBlock': run(computeFence),
		...Object.fromEntries(
			[0, 1, 2, 3, 4, 5, 6].map((level) => [`editor.heading${level}`, run((s: EditorState) => computeHeadingLine(s, level))])
		)
	});
}
