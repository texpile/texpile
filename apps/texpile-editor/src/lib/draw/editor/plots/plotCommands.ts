import type { PlotAxis, PlotSeries } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

type Bounds = [number | null, number | null];

export function writeSelectedAxis(ed: FigureEditorState, change: Partial<PlotAxis>) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeAxis(ed.source, st, change));
}

export function addPlotToSelectedAxis(ed: FigureEditorState, kind: 'function' | 'points') {
	const st = ed.selectedStatement;
	const next = st && ed.language.addPlot(ed.source, st, kind);
	if (next) ed.applyEdit(next);
}

export function writeSelectedPlot(ed: FigureEditorState, change: Partial<PlotSeries>) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writePlot(ed.source, st, change));
}

/** a from, to pair with one end replaced */
export function withBound(now: Bounds, k: 0 | 1, v: number | null): Bounds {
	return k === 0 ? [v, now[1]] : [now[0], v];
}
