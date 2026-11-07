<script lang="ts">
	import Inspector from '../../../inspector/Inspector.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor, showCode } = getFigureEditor();
</script>

<Inspector {editor} {showCode} />
