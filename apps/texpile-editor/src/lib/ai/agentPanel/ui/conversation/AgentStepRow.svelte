<script lang="ts">
	// One thing the agent did or is doing: what kind, on what, and how it went. A step on a file names it
	// the way Source Control does, and opens it
	import { Check, Circle, X, LoaderCircle } from '@lucide/svelte';
	import ChangedFileName from '$lib/workspace/scm/ui/changes/ChangedFileName.svelte';
	import { agentHost } from '../../agentHost.svelte';
	import { stepIcon, stepKindLabel } from './agentStepKinds';
	import type { ToolItem } from '../../agentPanel.types';
	import type { PathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';

	type Props = { tool: ToolItem; labels: PathLabels };
	const props: Props = $props();
	const Icon = $derived(stepIcon(props.tool.toolKind));
	const file = $derived(
		(props.tool.toolKind === 'edit' || props.tool.toolKind === 'delete' || props.tool.toolKind === 'move') && props.tool.paths[0]
			? props.tool.paths[0]
			: null
	);
</script>

<div class="border-surface-200-800 bg-surface-100-900 flex h-7 items-center gap-2 rounded-base border px-2 text-sm">
	<Icon class="text-muted size-3.5 shrink-0" />
	{#if file}
		<button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" onclick={() => agentHost.current?.openFile(file)}>
			<span class="text-muted shrink-0">{stepKindLabel(props.tool.toolKind)}</span>
			<ChangedFileName name={props.labels.baseName(file)} dir="" badge={props.tool.toolKind === 'delete' ? 'D' : 'M'} />
		</button>
	{:else}
		<span class="cap-center min-w-0 flex-1 truncate">{props.tool.title}</span>
	{/if}
	{#if props.tool.status === 'completed'}
		<Check class="text-success-ink size-3.5 shrink-0" />
	{:else if props.tool.status === 'failed'}
		<X class="text-error-ink size-3.5 shrink-0" />
	{:else if props.tool.status === 'in_progress'}
		<LoaderCircle class="text-primary-ink size-3.5 shrink-0 animate-spin" />
	{:else}
		<Circle class="text-muted size-3.5 shrink-0" />
	{/if}
</div>
