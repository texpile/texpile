<script lang="ts">
	import CodePane from '../../../code/CodePane.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<CodePane {editor} />
