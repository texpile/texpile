import type { FigureEditorState } from '$lib/draw/editor';

/** where the selected statements are written, in the file's text */
export function selectedRanges(editor: FigureEditorState): { from: number; to: number }[] {
	return editor.selectedStatements.map((s) => ({ from: s.from, to: s.to }));
}
