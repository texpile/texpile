<script lang="ts">
	import Inspector from '../../../inspector/Inspector.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<Inspector {editor} />
