<script lang="ts">
	import { FigureEditor } from '$lib/draw/editor';
</script>

<FigureEditor.Frame class="bg-surface-50-950 text-surface-950-50 flex h-full min-h-0 min-w-0 flex-1 overflow-clip">
	<FigureEditor.Stage>
		<FigureEditor.Canvas />
		<FigureEditor.ToolBar />
		<FigureEditor.Library />
		<FigureEditor.CanvasControls />
		<FigureEditor.Panels>
			<FigureEditor.Objects />
			<FigureEditor.Inspector />
		</FigureEditor.Panels>
	</FigureEditor.Stage>
</FigureEditor.Frame>
