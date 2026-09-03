<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import { m } from '$lib/paraglide/messages';

	let { open = $bindable(false), port }: { open?: boolean; port: number | null } = $props();

	const url = $derived(port ? `http://127.0.0.1:${port}` : '');
	const claudeCmd = $derived(url ? `claude mcp add --transport http texpile ${url}` : '');
	// keys per OpenAI's own MCP docs: a `url` entry selects streamable HTTP, `command` selects stdio
	const codexToml = $derived(url ? `[mcp_servers.texpile]\nurl = "${url}"` : '');

	let copied = $state('');
	async function copy(what: string, text: string) {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
</script>

{#snippet block(label: string, note: string, text: string, key: string)}
	<div>
		<div class="mb-1 flex items-baseline justify-between gap-3">
			<span class="text-sm font-medium">{label}</span>
			<span class="text-muted text-[11px]">{note}</span>
		</div>
		<div class="flex items-start gap-2">
			<code
				class="bg-surface-200-800 rounded-base text-surface-900-100 min-w-0 flex-1 p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
				>{text}</code
			>
			<button class="btn btn-xs preset-tonal shrink-0 text-xs" onclick={() => copy(key, text)} aria-label={m.prefs_mcp_copy()}>
				{#if copied === key}<Check class="size-3.5" />{:else}<Copy class="size-3.5" />{/if}
			</button>
		</div>
	</div>
{/snippet}

<Modal bind:open title={m.mcpsetup_title()} z="z-1400" card="flex max-h-full max-w-lg flex-col p-5">
	<div class="min-h-0 space-y-4 overflow-y-auto">
		<p class="text-muted text-sm">{m.mcpsetup_intro({ addr: url })}</p>
		{@render block(m.mcpsetup_claude(), 'CLI', claudeCmd, 'claude')}
		{@render block(m.mcpsetup_codex(), m.mcpsetup_codex_note(), codexToml, 'codex')}
		<p class="text-muted border-surface-300-700 border-t pt-3 text-xs">{m.mcpsetup_generic()}</p>
	</div>
</Modal>
