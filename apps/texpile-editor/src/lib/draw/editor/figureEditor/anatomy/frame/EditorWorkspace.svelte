<script lang="ts">
	import { getFigureEditor } from '../../figureEditorContext.svelte';
	import EditorCodePane from '../panes/EditorCodePane.svelte';
	import EditorCodeSplitter from '../panes/EditorCodeSplitter.svelte';
	import EditorSidebar from '../panes/EditorSidebar.svelte';
	import EditorSideSplitter from '../panes/EditorSideSplitter.svelte';
	import EditorCanvas from '../stage/EditorCanvas.svelte';
	import EditorCanvasControls from '../stage/EditorCanvasControls.svelte';
	import EditorLibrary from '../stage/EditorLibrary.svelte';
	import EditorStage from '../stage/EditorStage.svelte';
	import EditorToolBar from '../stage/EditorToolBar.svelte';
	import EditorFrame from './EditorFrame.svelte';

	const panes = getFigureEditor().editor.panes;
</script>

<!-- the code, the canvas and the objects with the inspector side by side, as Texpile lays out its workspace -->
<EditorFrame class="bg-surface-50-950 text-surface-950-50 flex h-full min-h-0 min-w-0 flex-1 overflow-clip">
	{#if panes.codeOpen}<EditorCodePane />{/if}
	<EditorCodeSplitter />
	<EditorStage>
		<EditorCanvas />
		<EditorToolBar />
		<EditorLibrary />
		<EditorCanvasControls />
	</EditorStage>
	<EditorSideSplitter />
	{#if panes.sideShown}<EditorSidebar />{/if}
</EditorFrame>
