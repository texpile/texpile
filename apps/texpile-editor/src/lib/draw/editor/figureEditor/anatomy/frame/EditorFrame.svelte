<script lang="ts">
	import type { Snippet } from 'svelte';
	import { blockPageZoom } from '../../../canvas/wheel';
	import { handleEditorKey } from '../../../state/keys/editorKeys';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	type Props = { class?: string; children: Snippet };
	const props: Props = $props();
	const context = getFigureEditor();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={context.frame}
	class={props.class}
	onkeydown={(e) => handleEditorKey(e, context.editor, context.gesture) && e.preventDefault()}
	{@attach blockPageZoom}
>
	{@render props.children()}
</div>
