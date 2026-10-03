<script lang="ts">
	// Preferences › AI Assistant: the agents the Agent tab's menu offers, a command of the reader's own among them, or
	// none, which hides the tab. Its own setting, apart from Refine's: Refine's custom command reads a request and
	// prints text, this one has to speak ACP
	import CheckChoiceList from '$lib/modals/window/CheckChoiceList.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { settings, updateSettings, type AppSettings } from '$lib/settings';
	import { agentLabel, PANEL_PRESETS } from '../agentNames';
	import { shownAgent } from '../agentSession.svelte';
	import { panelAgentsTicked, withPanelAgent } from '../agentOffer.svelte';
	import { installedAgents, lookUpAgents } from '../installedAgents.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PanelAgent } from '../agentPanel.types';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	lookUpAgents(true);

	const ticked = $derived(panelAgentsTicked());
	const choices = $derived(
		[...PANEL_PRESETS, 'custom' as const].map((value) => {
			const found = value === 'custom' ? undefined : installedAgents.found?.[value];
			const base = { value, label: agentLabel(value) };
			if (found === undefined) return base;
			// not found: not to be ticked, though one ticked before it went can still be unticked
			const aside = found ? m.prefs_ai_agent_installed() : m.prefs_ai_agent_not_found();
			return { ...base, aside, warn: !found, disabled: !found && !ticked.includes(value) };
		})
	);

	function tick(value: string, on: boolean): void {
		const agent = value as PanelAgent;
		const patch: Partial<AppSettings> = { agentPanelAgents: withPanelAgent(agent, on) };
		// no longer named by the tab; each window stops it if it is running there (agentSessionStale)
		if (!on && shownAgent() === agent) patch.agentPanel = '';
		updateSettings(patch);
	}
</script>

<div class={ROW}>
	<div class="min-w-0">
		<div class="text-sm font-medium">{m.prefs_agent_panel()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{m.prefs_agent_panel_note()}</p>
	</div>
	<CheckChoiceList {choices} values={ticked} label={m.prefs_agent_panel()} ontoggle={tick} below={customCommand} />
</div>

<!-- under its own box, as wide as the rows; what the command does is its hover, the example its placeholder -->
{#snippet customCommand(value: string)}
	{#if value === 'custom' && ticked.includes('custom')}
		<div class="px-1.5 pt-0.5 pb-1.5">
			<input
				class="input w-full font-mono text-xs"
				spellcheck="false"
				aria-label={m.prefs_ai_agent_command()}
				placeholder={m.prefs_agent_panel_command_placeholder()}
				use:tip={m.prefs_agent_panel_command_note()}
				value={settings.current.agentPanelCommand}
				onchange={(e) => updateSettings({ agentPanelCommand: e.currentTarget.value.trim() })}
			/>
		</div>
	{/if}
{/snippet}
