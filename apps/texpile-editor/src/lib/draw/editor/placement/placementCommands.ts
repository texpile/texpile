import type { NodePlacement } from '../figure/figureLanguage';
import { sourcePoint } from '../figure/geometry';
import type { FigureEditorState } from '../state/editorState.svelte';

export function placeSelected(ed: FigureEditorState, to: NodePlacement) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writePlacement(ed.source, st, to));
}

/** at a point of its own, where it is drawn now */
export function freeSelected(ed: FigureEditorState) {
	const st = ed.selectedStatement;
	const box = st && ed.drawingMatchesText ? ed.snapBoxes.find((b) => b.stmt === st.i) : null;
	if (!st || !box) return;
	const at = sourcePoint((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, ed.render.transformOf(st.i));
	ed.applyIfChanged(ed.language.writePlacement(ed.source, st, { at: [at[0], at[1]] }));
}

/** the nodes it can be placed beside, by name: every named node but itself */
export function placeTargets(ed: FigureEditorState) {
	const own = ed.selectedStatement;
	return (ed.picture?.statements ?? [])
		.filter((s) => s.kind === 'node' && s.i !== own?.i)
		.flatMap((s) => ed.language.nameOf(ed.source, s) ?? [])
		.filter((name, k, all) => all.indexOf(name) === k);
}
