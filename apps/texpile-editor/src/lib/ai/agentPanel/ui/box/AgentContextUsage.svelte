<script lang="ts">
	import { Popover, Portal, Progress } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import AgentContextCard from './AgentContextCard.svelte';
	import { contextShare, contextUsageLabel, isContextNearlyFull } from './contextUsageMeter';
	import type { AgentCommand, ContextUsage } from '../../agentPanel.types';

	type Props = { usage: ContextUsage; commands: AgentCommand[]; working: boolean; agent: string; onCompact: () => void };
	const props: Props = $props();
	let open = $state(false);
	const label = $derived(contextUsageLabel(props.usage));
	const color = $derived(isContextNearlyFull(props.usage) ? 'text-warning-ink' : '');
</script>

<Popover {open} onOpenChange={(e) => (open = e.open)} positioning={{ placement: 'top-end', offset: { mainAxis: 6 } }} autoFocus={false}>
	<Popover.Trigger>
		{#snippet element(attrs)}
			<button
				{...attrs}
				class="{color} hover:bg-surface-200-800 rounded-base flex size-6 shrink-0 items-center justify-center transition-colors"
				aria-label={label}
				use:tip={open ? null : label}
			>
				<Progress value={contextShare(props.usage) * 100} class="w-auto">
					<Progress.Circle class="[--size:calc(var(--spacing)*4)] [--thickness:calc(var(--spacing)*0.5)]">
						<Progress.CircleTrack class="stroke-surface-300-700" />
						<Progress.CircleRange class="stroke-current" />
					</Progress.Circle>
				</Progress>
			</button>
		{/snippet}
	</Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="bg-surface-50-950 border-surface-300-700 z-dropdown card w-64 border p-3 text-sm shadow-lg">
				<AgentContextCard
					usage={props.usage}
					commands={props.commands}
					working={props.working}
					agent={props.agent}
					onCompact={() => {
						open = false;
						props.onCompact();
					}}
				/>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
