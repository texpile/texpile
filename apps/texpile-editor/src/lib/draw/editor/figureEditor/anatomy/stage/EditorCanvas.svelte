<script lang="ts">
	import Canvas from '../../../canvas/Canvas.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor, gesture } = getFigureEditor();
</script>

<Canvas {editor} {gesture} />
