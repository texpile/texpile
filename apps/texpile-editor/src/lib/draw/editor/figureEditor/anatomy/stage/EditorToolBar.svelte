<script lang="ts">
	import ToolBar from '../../../tools/ToolBar.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<ToolBar {editor} />
