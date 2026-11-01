import type { NodeBoxChange } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

export function writeSelectedNodeBox(ed: FigureEditorState, change: NodeBoxChange) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeNodeBox(ed.source, st, change));
}
