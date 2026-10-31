<script lang="ts">
	import { Shapes } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import type { ToolId } from '../state/editorState.types';
	import { menuBarItemClass, menuContentClass } from '../ui/menuStyles';
	import { tip } from '$lib/components/tooltip.svelte';
	import { MORE_TOOLS, isOffered } from './tools';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const tools = $derived(MORE_TOOLS.filter((t) => isOffered(t, props.editor.language)));
	// the button shows the tool picked from it
	const picked = $derived(tools.find((t) => t.id === props.editor.tool));
	const Icon = $derived(picked?.icon ?? Shapes);
</script>

<Menu positioning={{ placement: 'bottom' }} onSelect={(d) => (props.editor.tool = d.value as ToolId)}>
	<Menu.Trigger
		class="btn-icon btn-icon-base {picked ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
		aria-label="More tools"
		aria-pressed={!!picked}
	>
		{#snippet element(attributes)}
			<button {...attributes} use:tip={'More tools'}><Icon class="size-5" /></button>
		{/snippet}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each tools as tool (tool.id)}
					{@const ItemIcon = tool.icon}
					<Menu.Item value={tool.id} class={menuBarItemClass}>
						<span class="flex items-center gap-2"
							><ItemIcon class="size-4 shrink-0" /><Menu.ItemText>{tool.label.split(',')[0]}</Menu.ItemText></span
						>
						<span class="opacity-50">{tool.key}</span>
					</Menu.Item>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
