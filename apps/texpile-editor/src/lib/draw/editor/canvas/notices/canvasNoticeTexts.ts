import { m } from '$lib/paraglide/messages';
import { BP_PER_CM } from '../../figure/lengthUnits';
import { formatNumber } from '../../figure/numbers';
import { inSentence } from '../../figure/inSentence';
import type { FigureEditorState } from '../../state/editorState.svelte';

export function naturalSizeText(ed: FigureEditorState) {
	const s = ed.sheet;
	if (!s || s.framed) return null;
	return `${formatNumber(s.w / BP_PER_CM)} × ${formatNumber(s.h / BP_PER_CM)} cm`;
}

export function firstEngineError(ed: FigureEditorState) {
	return ed.render.errors[0]?.replace(/^!\s*/, '').split('\n')[0];
}

export function firstUndrawnStatement(ed: FigureEditorState) {
	const st = ed.picture?.statements.find((s) => ed.render.failed.includes(s.i));
	if (!st || !ed.drawingMatchesText) return null;
	const line = ed.source.slice(0, st.from).split('\n').length;
	return { i: st.i, what: m.figure_notice_undrawn_what({ kind: inSentence(ed.language.describe(ed.source, st).title), line }) };
}
