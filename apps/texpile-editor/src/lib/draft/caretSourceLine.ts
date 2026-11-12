// The caret's line in the open file's source, 1-based: the source editor's own, or the visual editor's through its
// source map.
import { sourceCmView } from '$lib/stores/editorStore';

export function caretSourceLine(mode: 'visual' | 'source' | null, visualCaret: () => { line: number } | null): number | null {
	if (mode === 'visual') {
		const at = visualCaret();
		return at ? at.line + 1 : null;
	}
	const cm = sourceCmView.current;
	if (mode !== 'source' || !cm || !cm.dom.isConnected) return null;
	return cm.state.doc.lineAt(cm.state.selection.main.head).number;
}
