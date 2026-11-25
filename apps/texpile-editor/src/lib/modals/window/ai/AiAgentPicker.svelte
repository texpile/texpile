<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import AgentIcon from '$lib/ai/agent/AgentIcon.svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { installedAgents } from '$lib/ai/agent/aiAgent.svelte';
	import { INSTALL_PAGES, agentLabel, isAiAgent, type PresetAgent } from '$lib/ai/agent/aiAgents';
	import { INSTALL_PREFIX, agentPickerGroups } from './aiAgentPicker';
	import { m } from '$lib/paraglide/messages';

	const picked = $derived(settings.current.agent);
	const groups = $derived(agentPickerGroups(installedAgents.found, picked));
	const label = $derived(picked === 'custom' ? m.prefs_ai_agent_custom_command() : picked ? agentLabel(picked) : m.prefs_ai_agent_pick());

	function pick(value: string): void {
		if (value.startsWith(INSTALL_PREFIX))
			window.open(INSTALL_PAGES[value.slice(INSTALL_PREFIX.length) as PresetAgent], '_blank', 'noopener,noreferrer');
		else if (isAiAgent(value)) updateSettings({ agent: value });
	}
</script>

<MenuDropdown {groups} placement="bottom-end" onSelect={pick}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="btn preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal w-72 justify-between gap-2 text-sm"
			aria-label={m.prefs_ai_agent()}
		>
			<span class="flex min-w-0 items-center gap-2">
				{#if picked}<AgentIcon agent={picked} />{/if}
				<span class="cap-center truncate">{label}</span>
			</span>
			<ChevronDown class="text-muted size-4 shrink-0" />
		</button>
	{/snippet}
</MenuDropdown>
