<script lang="ts">
	// The AI category: the MCP server an assistant connects to, the agents Refine offers, and the Agent tab's.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { settings, updateSettings, setMcpEnabled } from '$lib/settings';
	import { agentName, isPresetAgent, PRESET_AGENTS, type RefineAgent } from '$lib/ai/selectionRefiner';
	import { lookUpRefineAgents, refineAgentsTicked, refineInstalled, withRefineAgent } from '$lib/ai/refineAgents.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import McpSetupModal from './McpSetupModal.svelte';
	import CheckChoiceList from './CheckChoiceList.svelte';
	import AgentModelChoice from './AgentModelChoice.svelte';
	import AgentPanelPrefs from '$lib/ai/agentPanel/ui/AgentPanelPrefs.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	type McpStatus = { running: boolean; port: number | null; error: string | null };
	let mcp = $state<McpStatus | null>(null);
	/** the instructions modal, stacked above Preferences */
	let setupOpen = $state(false);

	function nativeMcp() {
		return (window as unknown as { texpileNative?: { mcpStatus?: () => Promise<McpStatus> } }).texpileNative;
	}
	async function refreshMcp() {
		mcp = (await nativeMcp()?.mcpStatus?.()) ?? null;
	}
	// the port only exists once main has actually bound, so read it back after the flip
	async function onMcpToggle(v: boolean) {
		await setMcpEnabled(v);
		await refreshMcp();
	}
	// read on every showing: another window may have toggled it, or the port may have been taken since
	void refreshMcp();
	lookUpRefineAgents(true);

	const AGENTS: { value: RefineAgent; label: string }[] = [
		{ value: 'claude', label: m.prefs_ai_agent_claude() },
		{ value: 'codex', label: m.prefs_ai_agent_codex() },
		{ value: 'agy', label: m.prefs_ai_agent_agy() },
		{ value: 'custom', label: m.prefs_ai_agent_custom() }
	];
	const installed = $derived(refineInstalled.found);
	const ticked = $derived(refineAgentsTicked());
	const agentChoices = $derived(
		AGENTS.map((a) => {
			const found = isPresetAgent(a.value) ? installed?.[a.value] : undefined;
			if (found === undefined) return a;
			// not found: not to be ticked, though one ticked before it went can still be unticked
			const aside = found ? m.prefs_ai_agent_installed() : m.prefs_ai_agent_not_found();
			return { ...a, aside, warn: !found, disabled: !found && !ticked.includes(a.value) };
		})
	);
	// a model row for each ticked preset that is here, a way out for each that is not
	const tickedPresets = $derived(PRESET_AGENTS.filter((a) => ticked.includes(a)));

	function tick(value: string, on: boolean): void {
		updateSettings({ refineAgents: withRefineAgent(value as RefineAgent, on) });
	}
</script>

{#snippet label(text: string, hint = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
{/snippet}

<!-- under its own box, as wide as the rows; what the command does is its hover, the example its placeholder -->
{#snippet customCommand(value: string)}
	{#if value === 'custom' && ticked.includes('custom')}
		<div class="px-1.5 pt-0.5 pb-1.5">
			<input
				class="input w-full font-mono text-xs"
				spellcheck="false"
				aria-label={m.prefs_ai_agent_command()}
				placeholder={m.prefs_ai_agent_command_placeholder()}
				use:tip={m.prefs_ai_agent_command_note()}
				value={settings.current.aiAgentCommand}
				onchange={(e) => updateSettings({ aiAgentCommand: e.currentTarget.value.trim() })}
			/>
		</div>
	{/if}
{/snippet}

{#snippet toggle(checked: boolean, onChange: (v: boolean) => void)}
	<Switch {checked} onCheckedChange={(d) => onChange(d.checked)}>
		<Switch.Control><Switch.Thumb /></Switch.Control>
		<Switch.HiddenInput />
	</Switch>
{/snippet}

<div class={ROW}>
	<!-- persisted through the main process, not updateSettings: flipping this also has to start or stop the
	     loopback server, and main owns it -->
	{@render label(m.prefs_mcp(), m.prefs_mcp_note())}
	{@render toggle(settings.current.mcpEnabled === true, (v) => void onMcpToggle(v))}
</div>
{#if settings.current.mcpEnabled === true && mcp}
	<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b py-3">
		{#if mcp.running && mcp.port}
			<span class="text-muted text-xs">{m.prefs_mcp_status({ addr: `127.0.0.1:${mcp.port}` })}</span>
			<!-- the command lives in its own modal: it is long, and read once -->
			<button class="btn btn-xs preset-tonal shrink-0 text-xs" onclick={() => (setupOpen = true)}>{m.prefs_mcp_show()}</button>
		{:else}
			<span class="text-error-ink text-xs">{m.prefs_mcp_error({ error: mcp.error ?? '' })}</span>
		{/if}
	</div>
{/if}

<div class={ROW}>
	{@render label(m.prefs_ai_agent(), m.prefs_ai_agent_note())}
	<CheckChoiceList choices={agentChoices} values={ticked} label={m.prefs_ai_agent()} ontoggle={tick} below={customCommand} />
</div>
{#each tickedPresets as agent (agent)}
	{#if installed?.[agent]}
		<div class={ROW}>
			<AgentModelChoice {agent} />
		</div>
	{:else if installed}
		<!-- "Not found" beside the name says nothing about the way out, and the folder list is in another category -->
		<div class="border-surface-200-800 border-b py-3">
			<p class="text-muted text-xs leading-relaxed">{m.prefs_ai_agent_elsewhere({ agent: agentName(agent) })}</p>
		</div>
	{/if}
{/each}

<AgentPanelPrefs />

<McpSetupModal bind:open={setupOpen} port={mcp?.port ?? null} />
