<script lang="ts">
	import ObjectsPanel from '../../../objects/ObjectsPanel.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

{#if !editor.panes.compact || editor.panes.objectsShown}<ObjectsPanel {editor} />{/if}
