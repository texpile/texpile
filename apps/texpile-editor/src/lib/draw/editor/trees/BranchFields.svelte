<script lang="ts">
	import { m } from '$lib/paraglide/messages';
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
	<button class={BUTTON} onclick={() => addBranch(props.editor, 'child')} use:tip={m.figure_branch_child_tip()}>
		<ListTree class="size-4" /><span class="cap-center">{m.figure_branch_child()}</span>
	</button>
	<button class={BUTTON} disabled={isRoot} onclick={() => addBranch(props.editor, 'sibling')} use:tip={m.figure_branch_sibling_tip()}>
		<Plus class="size-4" /><span class="cap-center">{m.figure_branch_sibling()}</span>
	</button>
</div>
<div class="flex flex-wrap gap-1.5 px-3 pt-1.5">
	<button class={BUTTON} disabled={isRoot} onclick={() => shiftBranch(props.editor, -1)} use:tip={m.figure_branch_earlier_tip()}>
		<ArrowLeft class="size-4" /><span class="cap-center">{m.figure_branch_earlier()}</span>
	</button>
	<button class={BUTTON} disabled={isRoot} onclick={() => shiftBranch(props.editor, 1)} use:tip={m.figure_branch_later_tip()}>
		<ArrowRight class="size-4" /><span class="cap-center">{m.figure_branch_later()}</span>
	</button>
</div>
<p class={PANEL_NOTE}>{m.figure_branch_note()}</p>
