<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FIELD_LABEL } from '../ui/panelStyles';
	import {
		AlignCenterHorizontal,
		AlignCenterVertical,
		AlignEndHorizontal,
		AlignEndVertical,
		AlignHorizontalDistributeCenter,
		AlignStartHorizontal,
		AlignStartVertical,
		AlignVerticalDistributeCenter
	} from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { alignSelection, distributeSelection, type AlignMode } from '../state/selection/selectionCommands';
	import { tip } from '$lib/components/tooltip.svelte';

	const ALIGN: { how: AlignMode; label: () => string; icon: typeof AlignStartVertical }[] = [
		{ how: 'left', label: () => m.figure_align_left(), icon: AlignStartVertical },
		{ how: 'center', label: () => m.figure_align_center(), icon: AlignCenterVertical },
		{ how: 'right', label: () => m.figure_align_right(), icon: AlignEndVertical },
		{ how: 'top', label: () => m.figure_align_top(), icon: AlignStartHorizontal },
		{ how: 'middle', label: () => m.figure_align_middle(), icon: AlignCenterHorizontal },
		{ how: 'bottom', label: () => m.figure_align_bottom(), icon: AlignEndHorizontal }
	];
	const ICON = 'btn-icon btn-icon-xs hover:preset-tonal disabled:opacity-40';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

<div class="px-3 pt-2.5">
	<span class="{FIELD_LABEL} block">{m.figure_align()}</span>
	<div class="flex items-center gap-0.5">
		{#each ALIGN as a (a.how)}
			{@const Icon = a.icon}
			<button class={ICON} onclick={() => alignSelection(props.editor, a.how)} use:tip={a.label()}><Icon /></button>
		{/each}
		<span class="border-surface-200-800 mx-1 h-4.5 border-l"></span>
		<button
			class={ICON}
			disabled={props.editor.selection.length < 3}
			onclick={() => distributeSelection(props.editor, 'x')}
			use:tip={m.figure_align_space_across()}><AlignHorizontalDistributeCenter /></button
		>
		<button
			class={ICON}
			disabled={props.editor.selection.length < 3}
			onclick={() => distributeSelection(props.editor, 'y')}
			use:tip={m.figure_align_space_down()}><AlignVerticalDistributeCenter /></button
		>
	</div>
</div>
