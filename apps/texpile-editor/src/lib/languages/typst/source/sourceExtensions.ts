// Typst source-mode CodeMirror chords - the typst sibling of markdown/sourceExtensions.ts. The
// commands are the same pure computations TypstSourceToolbar already clicks, so a chord and its
// button produce identical edits; only the trigger differs.
//
// The chords match Typst VISUAL mode (TypstEditorView's Mod-b/i/u/`/./,/Shift-b/Shift-`/m/Shift-m/
// Alt-0..6) rather than being invented here, so muscle memory survives a mode switch. No link chord:
// Mod-k is the command palette's everywhere, and a link here opened the palette over the edit.
import { keymap, type EditorView } from '@codemirror/view';
import type { Extension, TransactionSpec, EditorState } from '@codemirror/state';
import { computeToggleDelim, computeWrap, computeHeadingLine, computeFence, computeMathBlock } from './sourceInsert';

function run(build: (state: EditorState) => TransactionSpec) {
	return (view: EditorView): boolean => {
		view.dispatch(build(view.state));
		return true;
	};
}

export function typSourceShortcuts(): Extension {
	return keymap.of([
		// * and _ are Typst's own strong/emphasis delimiters; the rest have no shorthand and go
		// through the function form the visual serializer also emits.
		{ key: 'Mod-b', run: run((s) => computeToggleDelim(s, '*')) },
		{ key: 'Mod-i', run: run((s) => computeToggleDelim(s, '_')) },
		{ key: 'Mod-u', run: run((s) => computeWrap(s, '#underline[', ']')) },
		{ key: 'Mod-`', run: run((s) => computeToggleDelim(s, '`')) },
		{ key: 'Mod-.', run: run((s) => computeWrap(s, '#super[', ']')) },
		{ key: 'Mod-Shift-,', run: run((s) => computeWrap(s, '#sub[', ']')) },
		{ key: 'Mod-m', run: run((s) => computeToggleDelim(s, '$')) },
		{ key: 'Mod-Shift-m', run: run(computeMathBlock) },
		{ key: 'Mod-Shift-b', run: run((s) => computeWrap(s, '#quote(block: true)[', ']')) },
		{ key: 'Mod-Shift-`', run: run(computeFence) },
		...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
			key: `Mod-Alt-${level}`,
			run: run((s: EditorState) => computeHeadingLine(s, level))
		}))
	]);
}
