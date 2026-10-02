<script lang="ts">
	// Preferences › AI Assistant: which agent the Agent tab works with, a command of the reader's own, or none.
	// Its own setting, apart from Refine's: Refine's custom command reads a request and prints text, this
	// one has to speak ACP
	import RadioChoiceList from '$lib/modals/window/RadioChoiceList.svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { agentLabel, PANEL_PRESETS } from '../agentNames';
	import { restartAgentSession } from '../agentSession.svelte';
	import { installedAgents, lookUpAgents } from '../installedAgents.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PanelAgent } from '../agentPanel.types';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	lookUpAgents(true);

	const agent = $derived(settings.current.agentPanel ?? '');
	const choices = $derived([
		{ value: 'off', label: m.prefs_ai_agent_off() },
		...[...PANEL_PRESETS, 'custom' as const].map((value) => {
			const found = value === 'custom' ? undefined : installedAgents.found?.[value];
			const base = { value, label: agentLabel(value) };
			return found === undefined
				? base
				: { ...base, aside: found ? m.prefs_ai_agent_installed() : m.prefs_ai_agent_not_found(), warn: !found };
		})
	]);

	// Off is only saved: the dock sees it and closes the tab, in every window
	function chooseAgent(value: string): void {
		if (value === 'off') updateSettings({ agentPanel: 'off' });
		else void restartAgentSession(value as PanelAgent);
	}
</script>

<div class={ROW}>
	<div class="min-w-0">
		<div class="text-sm font-medium">{m.prefs_agent_panel()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{m.prefs_agent_panel_note()}</p>
	</div>
	<RadioChoiceList {choices} value={agent} label={m.prefs_agent_panel()} onpick={chooseAgent} />
</div>
{#if agent === 'custom'}
	<div class={ROW}>
		<div class="min-w-0">
			<div class="text-sm font-medium">{m.prefs_ai_agent_command()}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">{m.prefs_agent_panel_command_note()}</p>
		</div>
		<input
			class="input w-56 shrink-0 font-mono text-xs"
			spellcheck="false"
			placeholder={m.prefs_agent_panel_command_placeholder()}
			value={settings.current.agentPanelCommand}
			onchange={(e) => updateSettings({ agentPanelCommand: e.currentTarget.value.trim() })}
		/>
	</div>
{/if}
