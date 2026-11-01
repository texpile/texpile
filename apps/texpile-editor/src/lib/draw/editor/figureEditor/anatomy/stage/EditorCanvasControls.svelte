<script lang="ts">
	import CanvasControls from '../../../chrome/CanvasControls.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<CanvasControls {editor} />
