<script lang="ts">
	// A run of steps. The finished ones fold into one line, so a short dock still shows the latest turn;
	// the ones still running or that failed stay a row each
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { stepIcon } from './agentStepKinds';
	import AgentStepRow from './AgentStepRow.svelte';
	import type { ToolItem } from '../../agentPanel.types';
	import type { PathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';

	type Props = { tools: ToolItem[]; labels: PathLabels };
	const props: Props = $props();
	const done = $derived(props.tools.filter((t) => t.status === 'completed'));
	const open = $derived(props.tools.filter((t) => t.status !== 'completed'));
	const kinds = $derived([...new Set(done.map((t) => t.toolKind))].slice(0, 4));
	let expanded = $state(false);
</script>

<div class="flex flex-col gap-1">
	{#if done.length}
		<button
			class="border-surface-200-800 bg-surface-100-900 hover:preset-tonal flex h-7 items-center gap-2 rounded-base border px-2 text-left text-sm"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			{#if expanded}<ChevronDown class="text-muted size-3.5 shrink-0" />{:else}<ChevronRight class="text-muted size-3.5 shrink-0" />{/if}
			<span class="text-muted flex shrink-0 gap-1">
				{#each kinds as kind (kind)}
					{@const Icon = stepIcon(kind)}
					<Icon class="size-3.5" />
				{/each}
			</span>
			<span class="cap-center shrink-0"
				>{done.length === 1 ? m.agent_panel_step_done() : m.agent_panel_steps_done({ count: done.length })}</span
			>
			<span class="text-muted cap-center min-w-0 truncate">· {done.map((t) => t.title).join(', ')}</span>
		</button>
		{#if expanded}
			{#each done as tool (tool.id)}<AgentStepRow {tool} labels={props.labels} />{/each}
		{/if}
	{/if}
	{#each open as tool (tool.id)}<AgentStepRow {tool} labels={props.labels} />{/each}
</div>
