<script lang="ts">
	import CanvasPrompt from '../notices/CanvasPrompt.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

{#if props.editor.tool === 'trim'}
	<CanvasPrompt text="Click the piece of a line, a box or a circle to cut it away up to where other shapes cross it" />
{/if}
