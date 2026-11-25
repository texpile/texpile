<script lang="ts">
	// The MCP server switch, its address once it runs, and the message that sets an assistant up
	import { settings, setMcpEnabled } from '$lib/settings';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import McpSetupModal from './McpSetupModal.svelte';
	import { mcpStatus } from './mcpStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	let setupOpen = $state(false);
	// read on every showing: another window may have toggled it, or the port may have been taken since
	void mcpStatus.refresh();

	// the port only exists once main has actually bound, so read it back after the flip
	async function toggle(on: boolean): Promise<void> {
		await setMcpEnabled(on);
		await mcpStatus.refresh();
	}
</script>

<!-- persisted through the main process, not updateSettings: flipping this also has to start or stop the loopback
     server, and main owns it -->
<PrefsSwitchRow id="mcp" checked={settings.current.mcpEnabled === true} onChange={(v) => void toggle(v)} />
{#if settings.current.mcpEnabled === true && mcpStatus.current}
	{@const mcp = mcpStatus.current}
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

<McpSetupModal bind:open={setupOpen} port={mcpStatus.current?.port ?? null} />
