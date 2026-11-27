<script lang="ts">
	// Preferences › AI agent: AI on or off, the one agent every AI feature uses, and its models
	import { settings } from '$lib/settings';
	import { agentOffered, lookUpAgents } from '$lib/ai/agent/aiAgent.svelte';
	import { setAiOff } from '$lib/ai/aiSwitch';
	import PrefsHeading from '../rows/PrefsHeading.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import AiAgentPicker from './AiAgentPicker.svelte';
	import AiAgentStatusLine from './AiAgentStatusLine.svelte';
	import AiAgentCommandField from './AiAgentCommandField.svelte';
	import AgentModelRows from './AgentModelRows.svelte';
	import McpServerRows from './McpServerRows.svelte';
	import { mcpStatus } from './mcpStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	lookUpAgents(true);
	const off = $derived(settings.current.aiOff);
	const agent = $derived(agentOffered());

	async function useAi(on: boolean): Promise<void> {
		await setAiOff(!on);
		await mcpStatus.refresh();
	}
</script>

<p class="text-muted pt-1 pb-2 text-xs leading-relaxed">{m.prefs_ai_intro()}</p>
<PrefsSwitchRow id="ai-on" checked={!off} onChange={(v) => void useAi(v)} />

<!-- what the switch turns off stays in sight, as it was picked, for when it is turned back on -->
<div class:opacity-50={off} inert={off}>
	<PrefsRow id="ai-agent">
		{#snippet below()}
			<AiAgentStatusLine />
			{#if settings.current.agent === 'custom'}<AiAgentCommandField />{/if}
			<p class="text-muted mt-1 text-xs leading-relaxed">
				{m.prefs_ai_other_models()}
				<a class="anchor" href="https://texpile.com/docs/ai-assistant/other-models" target="_blank" rel="noopener noreferrer"
					>{m.prefs_ai_other_models_link()}</a
				>
			</p>
		{/snippet}
		<AiAgentPicker />
	</PrefsRow>

	{#if agent}
		<PrefsHeading section="aiModels" />
		<AgentModelRows {agent} />
	{/if}

	<McpServerRows />
</div>
