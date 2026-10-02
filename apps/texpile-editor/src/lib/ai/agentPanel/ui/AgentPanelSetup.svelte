<script lang="ts">
	// The welcome screen's question about the Agent tab. Missing agents are grayed out, as in Refine's question above.
	// A custom command is set in Preferences
	import SetupChoice from '$lib/setup/SetupChoice.svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { agentLabel, PANEL_PRESETS } from '../agentNames';
	import { agentSession, restartAgentSession } from '../agentSession.svelte';
	import { installedAgents, lookUpAgents } from '../installedAgents.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PresetPanelAgent } from '../agentPanel.types';

	lookUpAgents(true);

	const installed = $derived(installedAgents.found);
	const picked = $derived(settings.current.agentPanel ?? '');

	function chooseAgent(value: '' | 'off' | PresetPanelAgent): void {
		if (value === '' || value === 'off') {
			updateSettings({ agentPanel: value });
			// setup can be run again from Help: an agent already running is not the one chosen any more
			if (value === '') agentSession.close();
		} else void restartAgentSession(value);
	}
</script>

<p class="mb-2 flex flex-wrap items-baseline gap-x-2">
	<span class="text-sm font-medium">{m.prefs_agent_panel()}</span><span class="text-muted text-xs">{m.setup_agent_panel_note()}</span>
</p>
<div class="grid grid-cols-2 gap-2.5">
	<SetupChoice kind="radio" checked={picked === ''} label={m.setup_agent_panel_later()} onpick={() => chooseAgent('')} />
	<SetupChoice kind="radio" checked={picked === 'off'} label={m.prefs_ai_agent_off()} onpick={() => chooseAgent('off')} />
	{#each PANEL_PRESETS as a (a)}
		<SetupChoice
			kind="radio"
			checked={picked === a}
			label={agentLabel(a)}
			aside={installed === null ? undefined : installed[a] ? m.prefs_ai_agent_installed() : m.setup_agent_not_installed()}
			disabled={installed !== null && !installed[a]}
			onpick={() => chooseAgent(a)}
		/>
	{/each}
</div>
