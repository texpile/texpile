<script lang="ts">
	import { RefreshCw } from '@lucide/svelte';
	import PaneHandle from '../../../ui/PaneHandle.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	type Props = { class?: string; style?: string };
	const props: Props = $props();
	const { editor } = getFigureEditor();
</script>

<PaneHandle icon={RefreshCw} onclick={() => editor.redraw()} title="Draw the canvas again" class={props.class} style={props.style} />
