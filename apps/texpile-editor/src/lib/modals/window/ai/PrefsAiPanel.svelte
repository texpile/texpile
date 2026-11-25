<script lang="ts">
	// Preferences › AI agent: AI on or off, the one agent every AI feature uses, its models, and where it is used
	import { settings } from '$lib/settings';
	import { agentOffered, lookUpAgents } from '$lib/ai/agent/aiAgent.svelte';
	import { setAiOff } from '$lib/ai/aiSwitch';
	import PrefsHeading from '../rows/PrefsHeading.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import AiAgentChoices from './AiAgentChoices.svelte';
	import AiAgentStatusLine from './AiAgentStatusLine.svelte';
	import AgentModelRows from './AgentModelRows.svelte';
	import AiUsesRows from './AiUsesRows.svelte';
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
	<PrefsHeading section="aiAgent" />
	<PrefsRow id="ai-agent" layout="block">
		<AiAgentChoices />
	</PrefsRow>
	<AiAgentStatusLine />

	{#if agent}
		<PrefsHeading section="aiModels" />
		<AgentModelRows {agent} />
	{/if}

	<PrefsHeading section="aiUses" />
	<AiUsesRows />
</div>
