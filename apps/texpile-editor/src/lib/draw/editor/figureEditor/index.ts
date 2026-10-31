import EditorRoot from './anatomy/frame/EditorRoot.svelte';
import EditorFrame from './anatomy/frame/EditorFrame.svelte';
import EditorStage from './anatomy/stage/EditorStage.svelte';
import EditorCanvas from './anatomy/stage/EditorCanvas.svelte';
import EditorToolBar from './anatomy/stage/EditorToolBar.svelte';
import EditorLibrary from './anatomy/stage/EditorLibrary.svelte';
import EditorCanvasControls from './anatomy/stage/EditorCanvasControls.svelte';
import EditorSideSplitter from './anatomy/panes/EditorSideSplitter.svelte';
import EditorSidebar from './anatomy/panes/EditorSidebar.svelte';

/** the editor's blocks: Root holds the state, every other block goes inside it, and keys reach the editor inside a Frame */
export const FigureEditor = {
	Root: EditorRoot,
	Frame: EditorFrame,
	Stage: EditorStage,
	Canvas: EditorCanvas,
	ToolBar: EditorToolBar,
	Library: EditorLibrary,
	CanvasControls: EditorCanvasControls,
	SideSplitter: EditorSideSplitter,
	Sidebar: EditorSidebar
};

export { getFigureEditor } from './figureEditorContext.svelte';
