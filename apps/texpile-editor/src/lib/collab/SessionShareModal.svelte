<script lang="ts">
	// Host-side share dialog: start/stop the session, show the code, count the guests.
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import { Copy, Check, X } from '@lucide/svelte';

	let {
		open = $bindable(false),
		root,
		onBeforeStart
	}: { open?: boolean; root: string | null; onBeforeStart?: () => Promise<void> } = $props();

	let relayDraft = $state($settings.collabRelayUrl);
	let relayTouched = $state(false);
	let copied = $state(false);
	$effect(() => {
		const url = $settings.collabRelayUrl;
		if (!relayTouched) relayDraft = url;
	});

	async function start() {
		if (!root) return;
		const trimmed = relayDraft.trim();
		if (trimmed && trimmed !== $settings.collabRelayUrl) updateSettings({ collabRelayUrl: trimmed });
		try {
			// flush the open file's unsaved edits to disk first, so the session seeds current content
			await onBeforeStart?.();
			await collabHost.start(root);
		} catch {
			/* collabHost.lastError carries the message */
		}
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(collabHost.shareCode);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard denied */
		}
	}

	function endSession() {
		void collabHost.end();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	const guestCount = $derived(collabHost.guestCount());
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold">{m.share_title()}</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => (open = false)} aria-label={m.session_cancel()}
					><X class="size-4" /></button
				>
			</div>

			{#if !collabHost.active}
				<p class="text-surface-600-300 mb-4 text-sm">{m.share_desc()}</p>
				<label class="mb-4 block">
					<span class="mb-1 block text-sm font-medium">{m.share_relay_label()}</span>
					<input class="input w-full text-sm" bind:value={relayDraft} oninput={() => (relayTouched = true)} />
					<span class="text-surface-500 mt-1 block text-xs">{m.share_relay_hint()}</span>
				</label>
				{#if collabHost.lastError}
					<p class="text-error-600-400 mb-3 text-sm">{m.share_error_generic({ message: collabHost.lastError })}</p>
				{/if}
				<div class="flex justify-end">
					<button class="btn preset-filled-primary-500" disabled={collabHost.status === 'starting' || !root} onclick={start}>
						{collabHost.status === 'starting' ? m.share_starting() : m.share_start()}
					</button>
				</div>
			{:else}
				<p class="text-surface-600-300 mb-3 text-sm">{m.share_active_hint()}</p>
				<div class="mb-3">
					<span class="mb-1 block text-sm font-medium">{m.share_code_label()}</span>
					<div class="flex items-center gap-2">
						<code class="bg-surface-200-800 flex-1 rounded px-3 py-2 font-mono text-sm tracking-wide select-all"
							>{collabHost.shareCode}</code
						>
						<button class="btn btn-sm preset-tonal" onclick={copyCode}>
							{#if copied}<Check class="size-4" />{m.share_copied()}{:else}<Copy class="size-4" />{m.share_copy()}{/if}
						</button>
					</div>
				</div>
				<p class="text-surface-600-300 mb-4 text-sm">
					{guestCount === 0 ? m.share_guests_zero() : guestCount === 1 ? m.share_guests_one() : m.share_guests_other({ count: guestCount })}
					{#if collabHost.status === 'reconnecting'}<span class="text-warning-600-400"> · {m.session_status_reconnecting()}</span>{/if}
				</p>
				<div class="flex justify-end">
					<button class="btn preset-tonal-error" onclick={endSession}>{m.share_end()}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
