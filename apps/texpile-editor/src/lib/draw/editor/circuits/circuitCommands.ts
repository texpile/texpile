import type { CircuitPart } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

/** part k of the selected statement changed; a type picked is the one the component tool adds next */
export function writeSelectedPart(ed: FigureEditorState, k: number, change: Partial<Omit<CircuitPart, 'placed'>>) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeCircuit(ed.source, st, k, change));
	if (change.type) ed.pickNextPart(change.type);
}
