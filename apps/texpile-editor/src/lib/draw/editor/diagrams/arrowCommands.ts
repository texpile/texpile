import type { DiagramArrow } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

export function writeSelectedArrow(ed: FigureEditorState, change: Partial<DiagramArrow>) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeArrow(ed.source, st, change));
}
