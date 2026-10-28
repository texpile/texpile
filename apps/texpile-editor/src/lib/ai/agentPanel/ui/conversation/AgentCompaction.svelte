<script lang="ts">
	import { ChevronDown, ChevronRight, LoaderCircle, Shrink, X } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import type { CompactionItem } from '../../agentPanel.types';

	type Props = { compaction: CompactionItem };
	const props: Props = $props();
	let open = $state(false);

	const status = $derived(props.compaction.status);
	const label = $derived(
		status === 'in_progress'
			? m.agent_panel_compacting()
			: status === 'completed'
				? m.agent_panel_compacted()
				: status === 'failed'
					? m.agent_panel_compaction_failed()
					: m.agent_panel_compaction_stopped()
	);
	const summary = $derived(status === 'completed' ? props.compaction.summary.trim() : '');
	const error = $derived(status === 'failed' ? props.compaction.error : null);
</script>

<div class="text-muted -mx-1 text-xs">
	{#if summary}
		<button class="hover:preset-tonal rounded-base flex items-center gap-1 px-1 py-0.5" aria-expanded={open} onclick={() => (open = !open)}>
			{#if open}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}
			<span class="cap-center">{label}</span>
		</button>
		{#if open}<p class="mt-1 pl-5 break-words whitespace-pre-wrap">{summary}</p>{/if}
	{:else}
		<p class="flex items-center gap-1 px-1 py-0.5">
			{#if status === 'in_progress'}
				<LoaderCircle class="size-3.5 shrink-0 animate-spin" />
			{:else if status === 'failed'}
				<X class="size-3.5 shrink-0" />
			{:else}
				<Shrink class="size-3.5 shrink-0" />
			{/if}
			<span class="cap-center">{error ? `${label}. ${error}` : label}</span>
		</p>
	{/if}
</div>
