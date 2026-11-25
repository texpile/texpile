<script lang="ts">
	// The one agent every AI feature uses: each one Texpile knows, whether it is on this computer, and a custom command
	import { ExternalLink } from '@lucide/svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { tip } from '$lib/components/tooltip.svelte';
	import { installedAgents } from '$lib/ai/agent/aiAgent.svelte';
	import { AI_AGENTS, INSTALL_PAGES, agentLabel, agentPlan, type AiAgent } from '$lib/ai/agent/aiAgents';
	import { m } from '$lib/paraglide/messages';

	const name = $props.id();
	const picked = $derived(settings.current.agent);

	function found(agent: AiAgent): boolean | undefined {
		return agent === 'custom' ? undefined : installedAgents.found?.[agent];
	}
</script>

<div class="flex flex-col gap-1" role="radiogroup" aria-label={m.prefs_ai_agent()}>
	{#each AI_AGENTS as agent (agent)}
		{@const here = found(agent)}
		<!-- one that is not here cannot be picked, though the one picked before it went stays picked -->
		{@const disabled = here === false && picked !== agent}
		<div
			class="rounded-base flex min-h-11 items-center gap-3 px-2.5 py-1.5 text-sm {picked === agent
				? 'bg-primary-tint'
				: disabled
					? ''
					: 'hover:preset-tonal'}"
		>
			<label class="flex min-w-0 flex-1 items-center gap-3 {disabled ? '' : 'cursor-pointer'}">
				<input
					type="radio"
					class="radio shrink-0 scale-75"
					{name}
					checked={picked === agent}
					{disabled}
					onchange={() => updateSettings({ agent })}
				/>
				<span class="min-w-0 flex-1 {disabled ? 'opacity-50' : ''}">
					<span class="font-medium">{agentLabel(agent)}</span>
					<span class="text-muted ml-1.5 text-xs">{agentPlan(agent)}</span>
				</span>
			</label>
			{#if agent === 'custom'}
				<input
					class="input w-40 shrink-0 font-mono text-xs"
					spellcheck="false"
					aria-label={m.prefs_ai_agent_command()}
					placeholder={m.prefs_ai_agent_command_placeholder()}
					use:tip={m.prefs_ai_agent_command_note()}
					value={settings.current.agentCommand}
					onchange={(e) => updateSettings({ agentCommand: e.currentTarget.value.trim() })}
				/>
			{:else if here}
				<span class="text-success-ink shrink-0 text-xs">{m.prefs_ai_agent_ready()}</span>
			{:else if here === false}
				<span class="flex shrink-0 items-center gap-2 text-xs">
					<span class="text-muted">{m.prefs_ai_agent_not_found()}</span>
					<a class="anchor flex items-center gap-1" href={INSTALL_PAGES[agent]} target="_blank" rel="noopener noreferrer"
						><span class="cap-center">{m.prefs_ai_agent_install()}</span><ExternalLink class="size-3" /></a
					>
				</span>
			{/if}
		</div>
	{/each}
</div>
