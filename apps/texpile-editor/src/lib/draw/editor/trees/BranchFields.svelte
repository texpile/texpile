<script lang="ts">
	import { PANEL_BUTTON, PANEL_NOTE } from '../ui/panelStyles';
	import { ArrowLeft, ArrowRight, ListTree, Plus } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { addBranch, shiftBranch } from './treeCommands';

	const BUTTON = `${PANEL_BUTTON} flex-1`;

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const isRoot = $derived(props.editor.tree.parent.get(props.editor.selected) === 0);
</script>

<div class="flex flex-wrap gap-1.5 px-3 pt-3">
	<button class={BUTTON} onclick={() => addBranch(props.editor, 'child')} use:tip={'Add a child (Tab)'}>
		<ListTree class="size-4" /><span class="cap-center">Child</span>
	</button>
	<button class={BUTTON} disabled={isRoot} onclick={() => addBranch(props.editor, 'sibling')} use:tip={'Add a sibling after it (Enter)'}>
		<Plus class="size-4" /><span class="cap-center">Sibling</span>
	</button>
</div>
<div class="flex flex-wrap gap-1.5 px-3 pt-1.5">
	<button class={BUTTON} disabled={isRoot} onclick={() => shiftBranch(props.editor, -1)} use:tip={'Swap with the sibling before it'}>
		<ArrowLeft class="size-4" /><span class="cap-center">Earlier</span>
	</button>
	<button class={BUTTON} disabled={isRoot} onclick={() => shiftBranch(props.editor, 1)} use:tip={'Swap with the sibling after it'}>
		<ArrowRight class="size-4" /><span class="cap-center">Later</span>
	</button>
</div>
<p class={PANEL_NOTE}>Drag it onto another node to move it there, with everything under it.</p>
