import type { FigureEditorState } from '../editorState.svelte';
import { deleteSelection } from './selectionCommands';

/** a `\node`'s text is lines, which TikZ breaks with `\\`; a cell's or a branch's is one line, written as it is */
export function isMultiline(ed: FigureEditorState) {
	return ed.selectedStatement?.kind === 'node';
}

export function readSelectedText(ed: FigureEditorState) {
	const st = ed.selectedStatement;
	const span = ed.selectedInfo?.text;
	// as written, not as the preview being typed shows it
	if (st && !span && ed.selectedConnector) return ed.language.readConnector(ed.source, st)?.label?.text ?? '';
	if (!st || !span) return null;
	return isMultiline(ed) ? (ed.language.readNodeLines(ed.source, st) ?? []).join('\n') : ed.language.readText(ed.source, st);
}

/** the source with the selected statement's text replaced, or null when the language would refuse it */
function withSelectedText(ed: FigureEditorState, text: string) {
	const st = ed.selectedStatement;
	const span = ed.selectedInfo?.text;
	// a line's or an arrow's text is its label, over its middle unless it is somewhere else already
	const c = st && !span ? ed.selectedConnector?.connector : null;
	if (st && c && !ed.language.textProblem(text)) {
		const label = text ? ({ pos: 'midway', side: 'above', ...c.label, text } as const) : null;
		return ed.language.writeConnector(ed.source, st, { label });
	}
	if (!st || !span || ed.language.textProblem(text)) return null;
	if (isMultiline(ed)) return ed.language.writeNodeLines(ed.source, st, text.split('\n'));
	return ed.language.writeText(ed.source, st, text);
}

/** drawn as it is typed, not written yet; null lets go of it */
export function previewSelectedText(ed: FigureEditorState, text: string | null) {
	const next = text === null ? null : withSelectedText(ed, text);
	if (text === null || next) ed.showPreview(next);
}

/** false when the text cannot be written, and so stays being typed */
export function writeSelectedText(ed: FigureEditorState, text: string) {
	// a line begun and left empty is no line
	const next = withSelectedText(ed, text.replace(/\s+$/, ''));
	if (!next) return false;
	ed.showPreview(null);
	ed.applyIfChanged(next);
	return true;
}

/** text left empty in a node with no outline leaves nothing to see: the node goes, and a new one is taken back */
export function dropEmptyText(ed: FigureEditorState) {
	const st = ed.selectedStatement;
	if (st?.kind !== 'node' || readSelectedText(ed)?.trim()) return;
	const style = ed.language.readStyle(ed.source, st);
	if (style?.stroke || style?.fill) return;
	if (ed.addedText === st.i) ed.undo();
	else deleteSelection(ed);
}
