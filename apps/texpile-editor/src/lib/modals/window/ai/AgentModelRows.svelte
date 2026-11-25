<script lang="ts">
	// A model for each task, from the list the agent picked gives
	import { LoaderCircle } from '@lucide/svelte';
	import { agentModels } from '$lib/ai/agent/agentModels';
	import { agentName } from '$lib/ai/agent/aiAgent.svelte';
	import type { AiAgent } from '$lib/ai/agent/aiAgents';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import AgentModelSelect from './AgentModelSelect.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { agent: AiAgent };
	const props: Props = $props();
	const list = $derived(agentModels(props.agent));
	const name = $derived(agentName(props.agent));
</script>

{#await list}
	<p class="text-muted flex items-center gap-2 py-2 text-xs">
		<LoaderCircle class="size-3.5 animate-spin" /><span class="cap-center">{m.prefs_ai_model_loading({ agent: name })}</span>
	</p>
{:then result}
	{#if result.ok}
		{@const models = result.models}
		<p class="text-muted pb-1 text-xs">{m.prefs_ai_models_note()}</p>
		<PrefsRow id="ai-model-proofread">
			{#snippet children(def)}<AgentModelSelect agent={props.agent} task="proofread" {models} label={def.label()} />{/snippet}
		</PrefsRow>
		<PrefsRow id="ai-model-refine">
			{#snippet children(def)}<AgentModelSelect agent={props.agent} task="refine" {models} label={def.label()} />{/snippet}
		</PrefsRow>
		<PrefsRow id="ai-model-convert">
			{#snippet children(def)}<AgentModelSelect agent={props.agent} task="convert" {models} label={def.label()} />{/snippet}
		</PrefsRow>
		<PrefsRow id="ai-model-chat">
			{#snippet children(def)}<AgentModelSelect agent={props.agent} task="chat" {models} label={def.label()} />{/snippet}
		</PrefsRow>
	{:else}
		<p class="text-error-ink py-2 text-xs leading-relaxed [overflow-wrap:anywhere]">
			{m.prefs_ai_model_failed({ agent: name, error: result.error })}
		</p>
	{/if}
{/await}
