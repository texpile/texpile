<script lang="ts">
	import type { Snippet } from 'svelte';
	import { wheelNavigation } from '../../../canvas/wheel';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	type Props = { class?: string; children: Snippet };
	const props: Props = $props();
	const { editor } = getFigureEditor();
</script>

<div class="relative flex min-w-0 flex-1 flex-col {props.class ?? ''}" {@attach wheelNavigation(editor.viewport)}>
	{@render props.children()}
</div>
