<script lang="ts">
	// Host-side share dialog: start/stop the session, show the code, count the guests.
	import { tip } from '$lib/components/tooltip.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { MAX_GUESTS } from '$lib/collab/protocol';
	import { settings, updateSettings, DEFAULT_COLLAB_RELAY_URL } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import { Copy, Check, RotateCcw, ShieldCheck, ChevronDown, TriangleAlert } from '@lucide/svelte';
	import { joinLinkFor } from '$lib/collab/joinLink.svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';

	let {
		open = $bindable(false),
		root,
		onBeforeStart
	}: { open?: boolean; root: string | null; onBeforeStart?: () => Promise<void> } = $props();

	let relayDraft = $state(settings.current.collabRelayUrl);
	let relayTouched = $state(false);
	let copied = $state(false);
	let linkCopied = $state(false);
	let advancedOpen = $state(false);
	$effect(() => {
		const url = settings.current.collabRelayUrl;
		// reveal the relay field unprompted only when it isn't the default one
		if (!relayTouched) {
			relayDraft = url;
			advancedOpen = url.trim().replace(/\/+$/, '') !== DEFAULT_COLLAB_RELAY_URL;
		}
	});

	async function start() {
		if (!root) return;
		const trimmed = relayDraft.trim();
		if (trimmed && trimmed !== settings.current.collabRelayUrl) updateSettings({ collabRelayUrl: trimmed });
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

	// only offered on the default relay: the public join page cannot reach a session on someone
	// else's relay, and a link that quietly fails is worse than no link
	const linkable = $derived(settings.current.collabRelayUrl.trim().replace(/\/+$/, '') === DEFAULT_COLLAB_RELAY_URL);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(joinLinkFor(collabHost.shareCode));
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 1500);
		} catch {
			/* clipboard denied */
		}
	}

	function endSession() {
		void collabHost.end();
	}

	const guestCount = $derived(collabHost.guestCount());
	// trailing slashes are stripped by the transport, so treat them as the same address here too
	const relayIsDefault = $derived(relayDraft.trim().replace(/\/+$/, '') === DEFAULT_COLLAB_RELAY_URL);

	function resetRelay() {
		relayDraft = DEFAULT_COLLAB_RELAY_URL;
		relayTouched = true;
	}
</script>

<Modal bind:open title={m.share_title()}>
	{#if !collabHost.active}
		<p class="text-muted mb-3 text-sm">{m.share_desc()} {m.share_capacity({ max: MAX_GUESTS })}</p>
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
			class="text-muted hover:text-surface-950-50 inline-flex items-center gap-1 text-xs"
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
					class="btn-icon btn-icon-xs hover:preset-tonal shrink-0"
					onclick={resetRelay}
					disabled={relayIsDefault}
					use:tip={m.collab_relay_reset_title()}
					aria-label={m.collab_relay_reset()}
				>
					<RotateCcw class="size-4" />
				</button>
			</div>
			<span class="text-muted mt-1 block text-xs">{m.share_relay_hint()}</span>
		{/if}

		<p class="text-muted border-surface-200-800 mt-4 flex items-start gap-1.5 border-t pt-3 text-xs">
			<ShieldCheck class="text-success-600-400 mt-px size-3.5 shrink-0" />
			<span>{m.collab_e2ee_note()}</span>
		</p>

		<ModalActions
			class="mt-4"
			buttons={[
				{
					label: collabHost.status === 'starting' ? m.share_starting() : m.share_start(),
					role: 'primary',
					disabled: collabHost.status === 'starting' || !root,
					onclick: start
				}
			]}
		/>
	{:else}
		<p class="text-muted mb-3 text-sm">{m.share_active_hint()}</p>
		<div class="mb-3">
			<span class="mb-1 block text-sm font-medium">{linkable ? m.share_link_label() : m.share_code_label()}</span>
			<div class="flex items-stretch gap-2">
				<code class="bg-surface-200-800 min-w-0 flex-1 truncate rounded-base px-3 py-2 font-mono text-sm tracking-wide select-all">
					{linkable ? joinLinkFor(collabHost.shareCode) : collabHost.shareCode}
				</code>
				<button
					class="preset-tonal flex shrink-0 items-center justify-center rounded-base px-3"
					onclick={linkable ? copyLink : copyCode}
					use:tip={linkable ? m.share_copy_link() : m.share_copy()}
					aria-label={linkable ? m.share_copy_link() : m.share_copy()}
				>
					{#if linkable ? linkCopied : copied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
				</button>
			</div>
			<!-- still shown: a code is what you read out over a call, and what someone types into the
			     desktop app by hand. The join field takes either. -->
			{#if linkable}
				<p class="text-muted mt-1.5 text-xs">
					{m.share_or_code()}
					<span class="font-mono select-all">{collabHost.shareCode}</span>
				</p>
			{/if}
		</div>
		<p class="text-muted mb-2 text-sm">
			{m.share_guests_count({ count: guestCount, max: MAX_GUESTS })}
			{#if collabHost.status === 'reconnecting'}<span class="text-warning-600-400"> · {m.session_status_reconnecting()}</span>{/if}
		</p>
		{#if collabHost.oversizedText.length}
			<p class="text-warning-700-300 mb-2 flex items-start gap-1.5 text-xs">
				<TriangleAlert class="text-warning-600-400 mt-px size-3.5 shrink-0" />
				<span>{m.share_oversized_warning({ names: collabHost.oversizedText.join(', ') })}</span>
			</p>
		{/if}
		<p class="text-muted border-surface-200-800 mt-4 flex items-start gap-1.5 border-t pt-3 text-xs">
			<ShieldCheck class="text-success-600-400 mt-px size-3.5 shrink-0" />
			<span>{m.collab_e2ee_note()}</span>
		</p>
		<ModalActions class="mt-4" buttons={[{ label: m.share_end(), role: 'primary', danger: true, onclick: endSession }]} />
	{/if}
</Modal>
