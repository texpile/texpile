import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

/** Insert a snippet at the cursor, leaving the editor really focused: zag refocuses the popover
 *  trigger a frame after close, so a synchronous view.focus() gets stolen back and the caret keeps
 *  painting while keys go nowhere. */
export function insertSnippetAtCursor(view: EditorView, template: string): void {
	const { from, to } = view.state.selection.main;
	snippet(template)(view, null, from, to);
	requestAnimationFrame(() => requestAnimationFrame(() => view.focus()));
}
