<script lang="ts">
	import FigureSidebar from '../../../sidebar/FigureSidebar.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<FigureSidebar {editor} />
