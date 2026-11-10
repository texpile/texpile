<script lang="ts">
	import { ListEnd, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { QueuedMessage } from '../../agentPanel.types';

	type Props = { queued: QueuedMessage[]; onRemove: (index: number) => void };
	const props: Props = $props();
</script>

<ul class="mb-1.5 flex flex-col gap-1" aria-label={m.agent_panel_queued()}>
	{#each props.queued as message, i (i)}
		<li class="bg-surface-100-900 rounded-base flex items-center gap-1.5 py-0.5 pr-0.5 pl-2 text-sm">
			<ListEnd class="text-muted size-3.5 shrink-0" />
			<span class="cap-center min-w-0 flex-1 truncate">{message.text.trim() || m.agent_panel_image()}</span>
			<button
				class="btn-icon btn-icon-sm hover:preset-tonal size-6 shrink-0 p-0"
				use:tip={m.agent_panel_unqueue()}
				aria-label={m.agent_panel_unqueue()}
				onclick={() => props.onRemove(i)}
			>
				<X class="size-3.5" />
			</button>
		</li>
	{/each}
</ul>
