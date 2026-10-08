// which format toolbar a pane's file takes: a LaTeX, Markdown or Typst file, not a comparison, once its editor shows
import type { EditorPaneProps } from '../editorPaneProps';

export type FormatToolbar = { kind: 'tex' | 'md' | 'typ'; mode: 'visual' | 'source' };

type ToolbarInputs = Pick<EditorPaneProps, 'loadedPath' | 'kind' | 'viewMode' | 'encodingIssue' | 'conflicted' | 'compare' | 'visualDoc'>;

export function formatToolbarOf(p: ToolbarInputs): FormatToolbar | null {
	const { kind } = p;
	if (!p.loadedPath || p.compare || (kind !== 'tex' && kind !== 'md' && kind !== 'typ')) return null;
	// a file the visual editor cannot take shows in source, whatever was asked
	const shown = p.viewMode === 'visual' && (p.encodingIssue || p.conflicted) ? 'source' : p.viewMode;
	if (shown !== 'source' && !p.visualDoc) return null;
	return { kind, mode: shown === 'visual' ? 'visual' : 'source' };
}
