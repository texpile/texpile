<script lang="ts">
	// What goes with a message: the file by its icon and name as the file tree shows it, and the selected lines when
	// there are some. In the box an x takes it off the message
	import { X } from '@lucide/svelte';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { linesLabel } from '../attach/attached';
	import type { Attached } from '../agentPanel.types';

	type Props = { attached: Attached; onDetach?: () => void };
	const props: Props = $props();
	const name = $derived(props.attached.path.split(/[\\/]/).pop() ?? props.attached.path);
</script>

<span
	class="border-surface-300-700 text-surface-700-300 rounded-base inline-flex h-6 max-w-56 min-w-0 shrink items-center gap-1 border pl-1.5 text-xs {props.onDetach
		? 'pr-0.5'
		: 'pr-1.5'}"
>
	<span class="flex min-w-0 items-center gap-1" use:tip={props.attached.lines ? m.agent_panel_selection_tip() : m.agent_panel_file_tip()}>
		<FileIcon {name} class="size-3.5 shrink-0" />
		<span class="truncate">{name}</span>
		{#if props.attached.lines}<span class="text-muted shrink-0">{linesLabel(props.attached.lines)}</span>{/if}
	</span>
	{#if props.onDetach}
		<button
			class="text-muted hover:bg-surface-200-800 rounded-base flex size-4.5 shrink-0 items-center justify-center transition-colors"
			aria-label={m.agent_panel_detach()}
			use:tip={m.agent_panel_detach()}
			onclick={props.onDetach}
		>
			<X class="size-3" />
		</button>
	{/if}
</span>
