<script lang="ts">
	// The AI category: the MCP server an assistant connects to, the agent Refine runs, and the Agent tab's.
	import { LoaderCircle } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { settings, updateSettings, setMcpEnabled, type AppSettings } from '$lib/settings';
	import { agentBridge, isPresetAgent, type PresetAgent } from '$lib/ai/selectionRefiner';
	import McpSetupModal from './McpSetupModal.svelte';
	import RadioChoiceList from './RadioChoiceList.svelte';
	import AgentModelChoice from './AgentModelChoice.svelte';
	import { AgentTest } from './agentTest.svelte';
	import AgentPanelPrefs from '$lib/ai/agentPanel/ui/AgentPanelPrefs.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	type McpStatus = { running: boolean; port: number | null; error: string | null };
	let mcp = $state<McpStatus | null>(null);
	/** the instructions modal, stacked above Preferences */
	let setupOpen = $state(false);
	let installed = $state<Record<PresetAgent, boolean> | null>(null);

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
	void agentBridge()
		?.detect()
		.then((found) => (installed = found))
		.catch(() => undefined);

	const AGENTS: { value: AppSettings['aiAgent']; label: string }[] = [
		{ value: '', label: m.prefs_ai_agent_off() },
		{ value: 'claude', label: m.prefs_ai_agent_claude() },
		{ value: 'codex', label: m.prefs_ai_agent_codex() },
		{ value: 'agy', label: m.prefs_ai_agent_agy() },
		{ value: 'custom', label: m.prefs_ai_agent_custom() }
	];
	const agent = $derived(settings.current.aiAgent ?? '');
	const agentChoices = $derived(
		AGENTS.map((a) => {
			const found = isPresetAgent(a.value) ? installed?.[a.value] : undefined;
			return found === undefined ? a : { ...a, aside: found ? m.prefs_ai_agent_installed() : m.prefs_ai_agent_not_found(), warn: !found };
		})
	);
	const agentLabel = $derived(AGENTS.find((a) => a.value === agent)?.label ?? '');
	const test = new AgentTest();

	function pick(value: AppSettings['aiAgent']): void {
		// a model belongs to one agent
		if (value !== agent) updateSettings({ aiAgent: value, aiAgentModel: '' });
		test.clear();
	}
</script>

{#snippet label(text: string, hint = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
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
	<RadioChoiceList choices={agentChoices} value={agent} label={m.prefs_ai_agent()} onpick={(v) => pick(v as AppSettings['aiAgent'])} />
</div>
{#if isPresetAgent(agent) && installed?.[agent]}
	<div class={ROW}>
		<AgentModelChoice {agent} onpick={() => test.clear()} />
	</div>
{:else if isPresetAgent(agent) && installed}
	<!-- "Not found" beside the name says nothing about the way out, and the folder list is in another category -->
	<div class="border-surface-200-800 border-b py-3">
		<p class="text-muted text-xs leading-relaxed">{m.prefs_ai_agent_elsewhere({ agent: agentLabel })}</p>
	</div>
{/if}
{#if agent === 'custom'}
	<div class={ROW}>
		{@render label(m.prefs_ai_agent_command(), m.prefs_ai_agent_command_note())}
		<input
			class="input w-56 shrink-0 font-mono text-xs"
			spellcheck="false"
			placeholder={m.prefs_ai_agent_command_placeholder()}
			value={settings.current.aiAgentCommand}
			onchange={(e) => {
				updateSettings({ aiAgentCommand: e.currentTarget.value.trim() });
				test.clear();
			}}
		/>
	</div>
{/if}
{#if agent}
	<div class={ROW}>
		<div class="min-w-0">
			{@render label(m.prefs_ai_test(), m.prefs_ai_test_note())}
			{#if test.result}
				<p class="mt-1 text-xs [overflow-wrap:anywhere] {test.result.ok ? 'text-success-ink' : 'text-error-ink'}">{test.result.text}</p>
			{/if}
		</div>
		{#if test.running}
			<button class="btn btn-sm preset-tonal shrink-0" onclick={() => test.cancel()}>
				<LoaderCircle class="size-4 animate-spin" />{m.ai_refine_cancel()}
			</button>
		{:else}
			<button
				class="btn btn-sm preset-tonal shrink-0"
				disabled={agent === 'custom' && !settings.current.aiAgentCommand}
				onclick={() => void test.run()}>{m.prefs_ai_test_button()}</button
			>
		{/if}
	</div>
{/if}

<AgentPanelPrefs />

<McpSetupModal bind:open={setupOpen} port={mcp?.port ?? null} />
