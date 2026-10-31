<script lang="ts">
	// the figure editor's workspace without its code pane: the paper's own source editor is the code, in a split
	import { FigureEditor, getFigureEditor } from '$lib/draw/editor';

	const panes = getFigureEditor().editor.panes;
</script>

<FigureEditor.Frame class="bg-surface-50-950 text-surface-950-50 flex h-full min-h-0 min-w-0 flex-1 overflow-clip">
	<FigureEditor.Stage>
		<FigureEditor.Canvas />
		<FigureEditor.ToolBar />
		<FigureEditor.Library />
		<FigureEditor.CanvasControls />
	</FigureEditor.Stage>
	<FigureEditor.SideSplitter />
	{#if panes.sideShown}<FigureEditor.Sidebar />{/if}
</FigureEditor.Frame>
