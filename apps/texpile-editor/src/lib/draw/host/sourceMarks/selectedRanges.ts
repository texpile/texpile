import type { FigureEditorState } from '$lib/draw/editor';

export function selectedRanges(editor: FigureEditorState): { from: number; to: number }[] {
	return editor.selectedStatements.map((s) => ({ from: s.from, to: s.to }));
}
