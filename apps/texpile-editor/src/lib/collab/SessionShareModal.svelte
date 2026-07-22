<script lang="ts">
	// Host-side share dialog: start/stop the session, show the code, count the guests.
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { MAX_GUESTS } from '$lib/collab/protocol';
	import { settings, updateSettings, DEFAULT_COLLAB_RELAY_URL } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import { Copy, Check, X, RotateCcw, ShieldCheck, ChevronDown, TriangleAlert } from '@lucide/svelte';

	let {
		open = $bindable(false),
		root,
		onBeforeStart
	}: { open?: boolean; root: string | null; onBeforeStart?: () => Promise<void> } = $props();

	let relayDraft = $state($settings.collabRelayUrl);
	let relayTouched = $state(false);
	let copied = $state(false);
	let advancedOpen = $state(false);
	$effect(() => {
		const url = $settings.collabRelayUrl;
		// reveal the relay field unprompted only when it isn't the default one
		if (!relayTouched) {
			relayDraft = url;
			advancedOpen = url.trim().replace(/\/+$/, '') !== DEFAULT_COLLAB_RELAY_URL;
		}
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
	// trailing slashes are stripped by the transport, so treat them as the same address here too
	const relayIsDefault = $derived(relayDraft.trim().replace(/\/+$/, '') === DEFAULT_COLLAB_RELAY_URL);

	function resetRelay() {
		relayDraft = DEFAULT_COLLAB_RELAY_URL;
		relayTouched = true;
	}
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
				<p class="text-surface-600-300 mb-3 text-sm">{m.share_desc()} {m.share_capacity({ max: MAX_GUESTS })}</p>
				<p class="text-warning-700-300 mb-4 flex items-start gap-1.5 text-xs">
					<TriangleAlert class="text-warning-600-400 mt-px size-3.5 shrink-0" />
					<span>{m.share_trust_warning()}</span>
				</p>
				{#if collabHost.lastError}
					<p class="text-error-600-400 mb-3 text-sm">{m.share_error_generic({ message: collabHost.lastError })}</p>
				{/if}

				<!-- plumbing almost nobody changes: collapsed unless they're already on a custom relay -->
				<button
					type="button"
					class="text-surface-500 hover:text-surface-950-50 inline-flex items-center gap-1 text-xs"
					onclick={() => (advancedOpen = !advancedOpen)}
				>
					<ChevronDown class="size-3.5 transition-transform {advancedOpen ? '' : '-rotate-90'}" />
					{m.share_relay_label()}
				</button>
				{#if advancedOpen}
					<div class="mt-2 flex gap-2">
						<input class="input flex-1 text-sm" bind:value={relayDraft} oninput={() => (relayTouched = true)} />
						<button
							type="button"
							class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
							onclick={resetRelay}
							disabled={relayIsDefault}
							title={m.collab_relay_reset_title()}
							aria-label={m.collab_relay_reset()}
						>
							<RotateCcw class="size-4" />
						</button>
					</div>
					<span class="text-surface-500 mt-1 block text-xs">{m.share_relay_hint()}</span>
				{/if}

				<p class="text-surface-500 border-surface-200-800 mt-4 flex items-start gap-1.5 border-t pt-3 text-xs">
					<ShieldCheck class="text-success-600-400 mt-px size-3.5 shrink-0" />
					<span>{m.collab_e2ee_note()}</span>
				</p>

				<div class="mt-4 flex justify-end">
					<button class="btn preset-filled-primary-500" disabled={collabHost.status === 'starting' || !root} onclick={start}>
						{collabHost.status === 'starting' ? m.share_starting() : m.share_start()}
					</button>
				</div>
			{:else}
				<p class="text-surface-600-300 mb-3 text-sm">{m.share_active_hint()}</p>
				<div class="mb-3">
					<span class="mb-1 block text-sm font-medium">{m.share_code_label()}</span>
					<div class="flex items-stretch gap-2">
						<code class="bg-surface-200-800 flex-1 rounded px-3 py-2 font-mono text-sm tracking-wide select-all"
							>{collabHost.shareCode}</code
						>
						<button
							class="preset-tonal flex shrink-0 items-center justify-center rounded px-3"
							onclick={copyCode}
							title={copied ? m.share_copied() : m.share_copy()}
							aria-label={m.share_copy()}
						>
							{#if copied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
						</button>
					</div>
				</div>
				<p class="text-surface-600-300 mb-2 text-sm">
					{m.share_guests_count({ count: guestCount, max: MAX_GUESTS })}
					{#if collabHost.status === 'reconnecting'}<span class="text-warning-600-400"> · {m.session_status_reconnecting()}</span>{/if}
				</p>
				{#if collabHost.oversizedText.length}
					<p class="text-warning-700-300 mb-2 flex items-start gap-1.5 text-xs">
						<TriangleAlert class="text-warning-600-400 mt-px size-3.5 shrink-0" />
						<span>{m.share_oversized_warning({ names: collabHost.oversizedText.join(', ') })}</span>
					</p>
				{/if}
				<p class="text-surface-500 border-surface-200-800 mt-4 flex items-start gap-1.5 border-t pt-3 text-xs">
					<ShieldCheck class="text-success-600-400 mt-px size-3.5 shrink-0" />
					<span>{m.collab_e2ee_note()}</span>
				</p>
				<div class="mt-4 flex justify-end">
					<button class="btn preset-tonal-error" onclick={endSession}>{m.share_end()}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
