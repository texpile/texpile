// Markdown source-mode CodeMirror extras, gathered here so everything md lives in lib/languages/markdown
// (SourceEditor itself stays dialect-neutral and just picks a list by file extension). The commands are the visual
// editor's, on the same keys. No link command: Mod-k is the command palette's everywhere.
import type { EditorView } from '@codemirror/view';
import { cmCommandKeys } from '$lib/keybindings/editors/cmCommandKeys';
import type { Extension, TransactionSpec, EditorState } from '@codemirror/state';
import { computeToggleDelim, computeHeadingLine, computeQuoteLines, computeFence, computeMathBlock } from './sourceInsert';

function run(build: (state: EditorState) => TransactionSpec) {
	return (view: EditorView): boolean => {
		view.dispatch(build(view.state));
		return true;
	};
}

export function mdSourceShortcuts(): Extension {
	return cmCommandKeys({
		'editor.bold': run((s) => computeToggleDelim(s, '**')),
		'editor.italic': run((s) => computeToggleDelim(s, '*')),
		'editor.strikethrough': run((s) => computeToggleDelim(s, '~~')),
		'editor.inlineCode': run((s) => computeToggleDelim(s, '`')),
		'editor.inlineMath': run((s) => computeToggleDelim(s, '$')),
		'editor.displayMath': run(computeMathBlock),
		'editor.blockquote': run(computeQuoteLines),
		'editor.codeBlock': run(computeFence),
		...Object.fromEntries(
			[0, 1, 2, 3, 4, 5, 6].map((level) => [`editor.heading${level}`, run((s: EditorState) => computeHeadingLine(s, level))])
		)
	});
}
