import { createContext } from 'svelte';
import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
import type { FigureEditorState } from '../state/editorState.svelte';

export class FigureEditorContext {
	frame = $state<HTMLElement>();

	constructor(
		readonly editor: FigureEditorState,
		readonly gesture: CanvasGesture,
		readonly showCode: ((at: number) => void) | null = null
	) {}
}

const [getFigureEditor, setFigureEditor] = createContext<FigureEditorContext>();

export { getFigureEditor, setFigureEditor };
