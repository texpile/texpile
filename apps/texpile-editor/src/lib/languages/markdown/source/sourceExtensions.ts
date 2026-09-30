// Markdown source-mode CodeMirror extras, gathered here so everything md lives in lib/languages/markdown
// (SourceEditor itself stays dialect-neutral and just picks a list by file extension). The
// chords mirror the visual editor's: Mod-b/i, Mod-Shift-x, Mod-`, Mod-Alt-0..6, Mod-m/Shift-m,
// Mod-Shift-b, Mod-Shift-`. No link chord: Mod-k is the command palette's everywhere.
import { keymap, type EditorView } from '@codemirror/view';
import type { Extension, TransactionSpec, EditorState } from '@codemirror/state';
import { computeToggleDelim, computeHeadingLine, computeQuoteLines, computeFence, computeMathBlock } from './sourceInsert';

function run(build: (state: EditorState) => TransactionSpec) {
	return (view: EditorView): boolean => {
		view.dispatch(build(view.state));
		return true;
	};
}

export function mdSourceShortcuts(): Extension {
	return keymap.of([
		{ key: 'Mod-b', run: run((s) => computeToggleDelim(s, '**')) },
		{ key: 'Mod-i', run: run((s) => computeToggleDelim(s, '*')) },
		{ key: 'Mod-Shift-x', run: run((s) => computeToggleDelim(s, '~~')) },
		{ key: 'Mod-`', run: run((s) => computeToggleDelim(s, '`')) },
		{ key: 'Mod-m', run: run((s) => computeToggleDelim(s, '$')) },
		{ key: 'Mod-Shift-m', run: run(computeMathBlock) },
		{ key: 'Mod-Shift-b', run: run(computeQuoteLines) },
		{ key: 'Mod-Shift-`', run: run(computeFence) },
		...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
			key: `Mod-Alt-${level}`,
			run: run((s: EditorState) => computeHeadingLine(s, level))
		}))
	]);
}
