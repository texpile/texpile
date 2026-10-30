import { BP_PER_CM } from '../../figure/lengthUnits';
import { formatNumber } from '../../figure/numbers';
import type { FigureEditorState } from '../../state/editorState.svelte';

/** the size the engine gave a picture with no frame, on the paper */
export function naturalSizeText(ed: FigureEditorState) {
	const s = ed.sheet;
	if (!s || s.framed) return null;
	return `${formatNumber(s.w / BP_PER_CM)} × ${formatNumber(s.h / BP_PER_CM)} cm`;
}

export function firstEngineError(ed: FigureEditorState) {
	return ed.render.errors[0]?.replace(/^!\s*/, '').split('\n')[0];
}

/** the first statement the engine could not draw at all, which the drawing leaves out, and where it is written */
export function firstUndrawnStatement(ed: FigureEditorState) {
	const st = ed.picture?.statements.find((s) => ed.render.failed.includes(s.i));
	if (!st || !ed.drawingMatchesText) return null;
	const line = ed.source.slice(0, st.from).split('\n').length;
	return { i: st.i, what: `${ed.language.describe(ed.source, st).title.toLowerCase()} on line ${line}` };
}
