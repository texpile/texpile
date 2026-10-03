<script lang="ts">
	// The dock's controls for the Agent tab: which agent, an earlier chat, and a fresh one. The one icon in
	// the strip is here, as the terminal's is on the shell picker
	import { Bot, ChevronDown, Plus } from '@lucide/svelte';
	import AgentChatPicker from './AgentChatPicker.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { settings } from '$lib/settings';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { agentLabel, runningAgentName } from '../../agentNames';
	import { agentSession, restartAgentSession, shownAgent } from '../../agentSession.svelte';
	import { panelAgentsTicked } from '../../agentOffer.svelte';
	import { installedAgents, lookUpAgents } from '../../installedAgents.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PanelAgent } from '../../agentPanel.types';

	/** where the agent cannot run: the controls stay, grayed, as the tab does */
	type Props = { disabled?: boolean };
	const props: Props = $props();

	lookUpAgents();

	const current = $derived(shownAgent());
	// the ones ticked in Preferences that can run here, and the one chosen even when it cannot
	const choices = $derived<PanelAgent[]>(
		panelAgentsTicked().filter((agent) =>
			agent === 'custom'
				? !!settings.current.agentPanelCommand.trim()
				: !installedAgents.found || installedAgents.found[agent] || agent === current
		)
	);
	const CHOOSE = 'choose-agents';
	const groups = $derived([
		{
			options: choices.map((agent) => ({ value: agent, label: agentLabel(agent), checked: agent === current }))
		},
		{ options: [{ value: CHOOSE, label: m.agent_panel_choose_agents(), checked: false }] }
	]);

	function switchAgent(agent: string): void {
		if (agent === CHOOSE) openPreferencesAt('ai');
		else if (agent !== current) void restartAgentSession(agent as PanelAgent);
	}
</script>

<MenuDropdown {groups} placement="bottom-end" onSelect={switchAgent}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="hover:preset-tonal rounded-base flex max-w-40 items-center gap-1.5 px-2 py-1 disabled:opacity-50 disabled:hover:bg-transparent"
			disabled={props.disabled}
		>
			<Bot class="size-3.5 shrink-0" />
			<!-- drops out first when the dock narrows, as the shell name does: the icon and chevron still say what it is -->
			<span class="truncate font-medium @max-[30rem]:hidden"
				>{current ? runningAgentName(current, agentSession.name) : m.agent_panel_choose()}</span
			>
			<ChevronDown class="size-3 shrink-0" />
		</button>
	{/snippet}
</MenuDropdown>
<AgentChatPicker />
<button
	class="btn-icon btn-icon-xs hover:preset-tonal"
	disabled={props.disabled}
	use:tip={m.agent_panel_new_chat()}
	aria-label={m.agent_panel_new_chat()}
	onclick={() => void restartAgentSession()}
>
	<Plus class="size-3.5" />
</button>
