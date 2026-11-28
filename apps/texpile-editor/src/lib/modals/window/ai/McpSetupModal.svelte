<script lang="ts">
	// one message for the reader to paste into their assistant, which knows its own setup better than a command we
	// would have to keep current for every client
	import { Check, Copy } from '@lucide/svelte';
	import Modal from '../../Modal.svelte';
	import { m } from '$lib/paraglide/messages';

	let { open = $bindable(false), port }: { open?: boolean; port: number | null } = $props();

	const message = $derived(port ? m.mcpsetup_message({ url: `http://127.0.0.1:${port}` }) : '');

	let copied = $state(false);
	async function copy() {
		if (!message) return;
		try {
			await navigator.clipboard.writeText(message);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
</script>

<Modal bind:open title={m.mcpsetup_title()} z="z-1400" card="flex max-h-full max-w-lg flex-col p-5">
	<div class="min-h-0 space-y-3 overflow-y-auto">
		<p class="text-muted text-sm">{m.mcpsetup_paste()}</p>
		<div class="flex items-start gap-2">
			<p
				class="bg-surface-200-800 rounded-container text-surface-900-100 min-w-0 flex-1 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]"
			>
				{message}
			</p>
			<button class="btn btn-xs preset-tonal shrink-0 text-xs" onclick={copy} aria-label={m.prefs_mcp_copy()}>
				{#if copied}<Check class="size-3.5" />{:else}<Copy class="size-3.5" />{/if}
			</button>
		</div>
	</div>
</Modal>
