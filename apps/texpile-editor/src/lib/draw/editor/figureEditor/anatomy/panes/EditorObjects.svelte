<script lang="ts">
	import ObjectsPanel from '../../../objects/ObjectsPanel.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<ObjectsPanel {editor} />
