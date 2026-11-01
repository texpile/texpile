<script lang="ts">
	import LibraryPanel from '../../../library/LibraryPanel.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<LibraryPanel {editor} />
