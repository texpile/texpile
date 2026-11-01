import type { ConnectorLabel, ConnectorRoute } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';

export function writeSelectedConnector(ed: FigureEditorState, change: { route?: ConnectorRoute; label?: ConnectorLabel | null }) {
	const st = ed.selectedStatement;
	ed.applyIfChanged(st && ed.language.writeConnector(ed.source, st, change));
}

export function writeSelectedLabelText(ed: FigureEditorState, text: string) {
	const label = ed.selectedConnector?.connector.label ?? null;
	writeSelectedConnector(ed, { label: text.trim() ? { text, pos: label?.pos ?? 'midway', side: label ? label.side : 'above' } : null });
}

export function placeSelectedLabel(ed: FigureEditorState, part: Partial<ConnectorLabel>) {
	const label = ed.selectedConnector?.connector.label;
	if (label) writeSelectedConnector(ed, { label: { ...label, ...part } });
}
