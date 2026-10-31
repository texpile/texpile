import EditorRoot from './anatomy/frame/EditorRoot.svelte';
import EditorFrame from './anatomy/frame/EditorFrame.svelte';
import EditorWorkspace from './anatomy/frame/EditorWorkspace.svelte';
import EditorStage from './anatomy/stage/EditorStage.svelte';
import EditorCanvas from './anatomy/stage/EditorCanvas.svelte';
import EditorToolBar from './anatomy/stage/EditorToolBar.svelte';
import EditorLibrary from './anatomy/stage/EditorLibrary.svelte';
import EditorCanvasControls from './anatomy/stage/EditorCanvasControls.svelte';
import EditorCodePane from './anatomy/panes/EditorCodePane.svelte';
import EditorCodeSplitter from './anatomy/panes/EditorCodeSplitter.svelte';
import EditorSideSplitter from './anatomy/panes/EditorSideSplitter.svelte';
import EditorSidebar from './anatomy/panes/EditorSidebar.svelte';
import EditorObjects from './anatomy/panes/EditorObjects.svelte';
import EditorInspector from './anatomy/panes/EditorInspector.svelte';
import EditorMenuBar from './anatomy/titlebar/EditorMenuBar.svelte';
import EditorLayoutMenu from './anatomy/titlebar/EditorLayoutMenu.svelte';

/** the editor's blocks: Root holds the state, every other block goes inside it, and keys reach the editor inside a
 *  Frame; Workspace is them all laid out as the web app shows them */
export const FigureEditor = {
	Root: EditorRoot,
	Frame: EditorFrame,
	Workspace: EditorWorkspace,
	Stage: EditorStage,
	Canvas: EditorCanvas,
	ToolBar: EditorToolBar,
	Library: EditorLibrary,
	CanvasControls: EditorCanvasControls,
	CodePane: EditorCodePane,
	CodeSplitter: EditorCodeSplitter,
	SideSplitter: EditorSideSplitter,
	Sidebar: EditorSidebar,
	Objects: EditorObjects,
	Inspector: EditorInspector,
	MenuBar: EditorMenuBar,
	LayoutMenu: EditorLayoutMenu
};

export { getFigureEditor } from './figureEditorContext.svelte';
