import EditorRoot from './anatomy/frame/EditorRoot.svelte';
import EditorFrame from './anatomy/frame/EditorFrame.svelte';
import EditorStage from './anatomy/stage/EditorStage.svelte';
import EditorCanvas from './anatomy/stage/EditorCanvas.svelte';
import EditorToolBar from './anatomy/stage/EditorToolBar.svelte';
import EditorLibrary from './anatomy/stage/EditorLibrary.svelte';
import EditorCanvasControls from './anatomy/stage/EditorCanvasControls.svelte';
import EditorPanels from './anatomy/stage/EditorPanels.svelte';
import EditorObjects from './anatomy/stage/EditorObjects.svelte';
import EditorInspector from './anatomy/stage/EditorInspector.svelte';

export const FigureEditor = {
	Root: EditorRoot,
	Frame: EditorFrame,
	Stage: EditorStage,
	Canvas: EditorCanvas,
	ToolBar: EditorToolBar,
	Library: EditorLibrary,
	CanvasControls: EditorCanvasControls,
	Panels: EditorPanels,
	Objects: EditorObjects,
	Inspector: EditorInspector
};

export { getFigureEditor } from './figureEditorContext.svelte';
