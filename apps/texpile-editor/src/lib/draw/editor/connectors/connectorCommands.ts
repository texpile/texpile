import type { ConnectorLabel, ConnectorRoute } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

export function writeSelectedConnector(ed: FigureEditorState, change: { route?: ConnectorRoute; label?: ConnectorLabel | null }) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeConnector(ed.source, st, change));
}

/** the label's text written; an empty one takes the label away, a new one sits midway above */
export function writeSelectedLabelText(ed: FigureEditorState, text: string) {
	const label = ed.selectedConnector?.connector.label ?? null;
	writeSelectedConnector(ed, { label: text.trim() ? { text, pos: label?.pos ?? 'midway', side: label ? label.side : 'above' } : null });
}

/** where the label sits along the connector or beside it; nothing without a label */
export function placeSelectedLabel(ed: FigureEditorState, part: Partial<ConnectorLabel>) {
	const label = ed.selectedConnector?.connector.label;
	if (label) writeSelectedConnector(ed, { label: { ...label, ...part } });
}
