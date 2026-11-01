import type { CircuitPart } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

export function writeSelectedPart(ed: FigureEditorState, k: number, change: Partial<Omit<CircuitPart, 'placed'>>) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeCircuit(ed.source, st, k, change));
	if (change.type) ed.pickNextPart(change.type);
}
