<script lang="ts">
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
	import { tip } from '../ui/tooltip';

	const ALIGN: { how: AlignMode; label: string; icon: typeof AlignStartVertical }[] = [
		{ how: 'left', label: 'Align left sides', icon: AlignStartVertical },
		{ how: 'center', label: 'Align centers across', icon: AlignCenterVertical },
		{ how: 'right', label: 'Align right sides', icon: AlignEndVertical },
		{ how: 'top', label: 'Align tops', icon: AlignStartHorizontal },
		{ how: 'middle', label: 'Align middles', icon: AlignCenterHorizontal },
		{ how: 'bottom', label: 'Align bottoms', icon: AlignEndHorizontal }
	];
	const ICON = 'btn-icon btn-icon-xs hover:preset-tonal disabled:opacity-40';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

<div class="px-3 pt-2.5">
	<span class="{FIELD_LABEL} block">Align</span>
	<div class="flex items-center gap-0.5">
		{#each ALIGN as a (a.how)}
			{@const Icon = a.icon}
			<button class={ICON} onclick={() => alignSelection(props.editor, a.how)} use:tip={a.label}><Icon /></button>
		{/each}
		<span class="border-surface-200-800 mx-1 h-4.5 border-l"></span>
		<button
			class={ICON}
			disabled={props.editor.selection.length < 3}
			onclick={() => distributeSelection(props.editor, 'x')}
			use:tip={'Space evenly across'}><AlignHorizontalDistributeCenter /></button
		>
		<button
			class={ICON}
			disabled={props.editor.selection.length < 3}
			onclick={() => distributeSelection(props.editor, 'y')}
			use:tip={'Space evenly up and down'}><AlignVerticalDistributeCenter /></button
		>
	</div>
</div>
