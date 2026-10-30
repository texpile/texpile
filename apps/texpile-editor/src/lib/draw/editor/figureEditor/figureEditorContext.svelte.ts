import { createContext } from 'svelte';
import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
import type { FigureEditorState } from '../state/editorState.svelte';

export class FigureEditorContext {
	// the Frame's element: keys and the clipboard inside it are the editor's
	frame = $state<HTMLElement>();

	constructor(
		readonly editor: FigureEditorState,
		readonly gesture: CanvasGesture
	) {}
}

const [getFigureEditor, setFigureEditor] = createContext<FigureEditorContext>();

export { getFigureEditor, setFigureEditor };
