<script lang="ts">
	// What the agent asks to be allowed to do, pinned under the conversation until it is answered. Drawn
	// as the steps are, not as a warning: asking first is the agent working as it should
	import { ShieldQuestion } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { permissionOptionLabel } from './permissionOptionLabel';
	import type { PermissionAsk } from '../agentPanel.types';

	type Props = { ask: PermissionAsk; agent: string; onAnswer: (id: string, optionId: string | null) => void };
	const props: Props = $props();
</script>

<div
	class="border-surface-300-700 bg-surface-100-900 mx-3 mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-base border py-1.5 pr-1.5 pl-2.5 text-sm"
>
	<ShieldQuestion class="text-primary-ink size-4 shrink-0" />
	<span class="cap-center shrink-0 font-medium">{m.agent_panel_asks({ agent: props.agent })}</span>
	<span class="cap-center text-muted min-w-0 flex-1 truncate">{props.ask.title}</span>
	<span class="flex shrink-0 gap-1">
		{#each props.ask.options as option (option.optionId)}
			<button
				class="btn btn-sm {option.kind === 'allow_once' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
				onclick={() => props.onAnswer(props.ask.id, option.optionId)}>{permissionOptionLabel(option.kind, option.name)}</button
			>
		{/each}
	</span>
</div>
