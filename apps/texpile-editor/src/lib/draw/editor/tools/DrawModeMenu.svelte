<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import type { ToolId } from '../state/editorState.types';
	import { DRAW_MODES, type DrawMode, type ShapeFamily } from '../state/drawModes/drawModes';
	import { menuContentClass, menuItemClass } from '../ui/menuStyles';
	import { tip } from '../ui/tooltip';
	import DrawModeIcon from './DrawModeIcon.svelte';

	type Props = { editor: FigureEditorState; tool: ToolId; family: ShapeFamily; label: string };
	const props: Props = $props();

	const current = $derived(props.editor.drawModes[props.family]);
</script>

<!-- CAD's flyout: the ways this shape is drawn -->
<Menu positioning={{ placement: 'bottom-start' }} onSelect={(d) => props.editor.pickDrawMode(props.tool, d.value as DrawMode)}>
	<Menu.Trigger
		class="hover:preset-tonal rounded-base -ml-1 flex h-8 w-3.5 items-center justify-center"
		aria-label={`${props.label}: how to draw it`}
	>
		{#snippet element(attributes)}
			<button {...attributes} use:tip={`${props.label}: how to draw it`}><ChevronDown class="size-3" /></button>
		{/snippet}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each DRAW_MODES[props.family] as entry (entry.mode)}
					<Menu.Item value={entry.mode} class={menuItemClass}>
						<DrawModeIcon family={props.family} mode={entry.mode} class="size-4 shrink-0" />
						<Menu.ItemText class="flex-1">{entry.label}</Menu.ItemText>
						{#if entry.mode === current}<Check class="text-primary-ink size-3.5" />{/if}
					</Menu.Item>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
