<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import CanvasPrompt from '../notices/CanvasPrompt.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

{#if props.editor.tool === 'trim'}
	<CanvasPrompt text={m.figure_trim_hint()} />
{/if}
