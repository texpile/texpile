<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import { tip, unavailableTip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { compactBlockedReason, contextShare, contextUsagePercent, contextUsageTokens, isContextNearlyFull } from './contextUsageMeter';
	import type { AgentCommand, ContextUsage } from '../../agentPanel.types';

	type Props = { usage: ContextUsage; commands: AgentCommand[]; working: boolean; agent: string; onCompact: () => void };
	const props: Props = $props();
	const blocked = $derived(compactBlockedReason(props.commands, props.working, props.agent));
</script>

<div class="flex items-center justify-between gap-3">
	<span class="cap-center font-semibold">{m.agent_panel_context_title()}</span>
	{#if blocked}
		<button class="text-muted cursor-default text-xs" aria-disabled="true" use:unavailableTip={blocked}>
			{m.agent_panel_compact_now()}
		</button>
	{:else}
		<button class="anchor text-xs" use:tip={m.agent_panel_compact_note()} onclick={props.onCompact}>
			{m.agent_panel_compact_now()}
		</button>
	{/if}
</div>
<Progress value={contextShare(props.usage) * 100} class="mt-2">
	<Progress.Track class="h-1.5">
		<Progress.Range class={isContextNearlyFull(props.usage) ? 'bg-warning-500' : 'bg-primary-500'} />
	</Progress.Track>
</Progress>
<div class="text-muted mt-1.5 flex justify-between gap-3 text-xs">
	<span>{contextUsageTokens(props.usage)}</span>
	<span>{contextUsagePercent(props.usage)}</span>
</div>
