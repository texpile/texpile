<script lang="ts">
	// The join screen for a shared session: enter the code, or the goodbye screen after it ends.
	// Once joined, App swaps to WorkspaceView (guest mode) — this only covers the not-yet-editing states.
	import { tip } from '$lib/components/tooltip.svelte';
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { formatShareCode, isValidShareCode, normalizeShareCode } from '$lib/collab/e2e/shareCode';
	import { pendingJoinCode, pendingJoinName, codeFromJoinLink, appLinkFor } from '$lib/collab/joinLink.svelte';
	import AppFrame from '$lib/chrome/AppFrame.svelte';
	import { settings, updateSettings, DEFAULT_COLLAB_RELAY_URL } from '$lib/settings';
	import { userData, updateUserData } from '$lib/storage/userData';
	import { m } from '$lib/paraglide/messages';
	import { RotateCcw, ShieldCheck, ChevronDown, ExternalLink } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';

	let codeInput = $state('');
	// a join link carries the code, whether this tab opened with one or the OS handed the running
	// app a texpile:// link. Either way the name is all that is left to fill in.
	$effect(() => {
		const handed = pendingJoinCode.current;
		if (handed) codeInput = formatShareCode(handed);
		const handedName = pendingJoinName.current;
		if (handedName) nameInput = handedName;
	});
	let nameInput = $state(loadName());
	let relayDraft = $state(settings.current.collabRelayUrl);
	let relayTouched = $state(false);
	let advancedOpen = $state(false);
	$effect(() => {
		const url = settings.current.collabRelayUrl;
		// reveal the relay field unprompted only when it isn't the default one
		if (!relayTouched) {
			relayDraft = url;
			advancedOpen = url.trim().replace(/\/+$/, '') !== DEFAULT_COLLAB_RELAY_URL;
		}
	});

	function loadName(): string {
		return userData.current.collabName;
	}

	async function join() {
		const trimmedRelay = relayDraft.trim();
		if (trimmedRelay && trimmedRelay !== settings.current.collabRelayUrl) updateSettings({ collabRelayUrl: trimmedRelay });
		updateUserData({ collabName: nameInput.trim() });
		await collabGuest.join(codeInput, nameInput);
	}

	/**
	 * Group the code as it is typed, so a hand-entered one matches the hyphenated form people are
	 * reading off the host's screen. Normalizing already made the separators optional for JOINING;
	 * this is about being able to see your place in 26 characters while entering them.
	 *
	 * The caret is re-derived rather than restored, because inserting a separator behind it would
	 * otherwise leave it one character back on every fifth keystroke. Count the significant
	 * characters before the caret, then walk that far into the formatted string - which also lands
	 * correctly when the edit was a paste, or a deletion from the middle.
	 */
	function onCodeInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		// a pasted join link resolves to the code it carries; caret handling below is for typing
		const linked = codeFromJoinLink(el.value);
		if (linked) {
			el.value = formatShareCode(linked);
			codeInput = el.value;
			el.setSelectionRange(el.value.length, el.value.length);
			return;
		}
		const before = normalizeShareCode(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
		const formatted = formatShareCode(el.value);
		// assign the DOM value first: Svelte's own update then sees the element already holding this
		// string and skips it, so it cannot clobber the caret we are about to set
		el.value = formatted;
		codeInput = formatted;
		let pos = 0;
		for (let seen = 0; pos < formatted.length && seen < before; pos++) if (formatted[pos] !== '-') seen++;
		// step past a separator the just-typed character completed, so the caret sits ready for the
		// next one rather than in front of a hyphen
		while (pos < formatted.length && formatted[pos] === '-') pos++;
		el.setSelectionRange(pos, pos);
	}

	let appModalOpen = $state(false);
	let nameEl = $state<HTMLInputElement | null>(null);

	// the modal interrupted a join, so dismissing it should finish the join rather than hand the
	// user back a form they have to submit again. Nothing to submit without a name: put the caret
	// there instead of failing silently.
	function continueInBrowser() {
		appModalOpen = false;
		if (!joinDisabled) void join();
		else nameEl?.focus();
	}

	/**
	 * Hand the code to the desktop app, then offer the way out regardless.
	 *
	 * There is no API for "is this scheme registered". Watching for blur to infer success sounds
	 * right and is not: anything else taking focus - devtools, a notification - looks identical to
	 * the app opening, so a genuinely dead link stayed silent. Showing the prompt unconditionally is
	 * never wrong; if the app did open, the tab is behind it and the prompt is dismissed on return.
	 */
	function openInApp() {
		if (!isValidShareCode(codeInput)) return;
		window.location.href = appLinkFor(codeInput, nameInput);
		// 300ms, not longer: nothing is being detected, so the only job is to let the browser's own
		// "Open Texpile?" dialog land first rather than stacking two prompts. Below the threshold
		// where a stall reads as one, so it needs no spinner.
		setTimeout(() => (appModalOpen = true), 300);
	}

	function backHome() {
		collabGuest.reset();
		navigate('/');
	}

	const joinDisabled = $derived(collabGuest.status === 'joining' || !isValidShareCode(codeInput) || !nameInput.trim());
	// trailing slashes are stripped by the transport, so treat them as the same address here too
	const relayIsDefault = $derived(relayDraft.trim().replace(/\/+$/, '') === DEFAULT_COLLAB_RELAY_URL);

	function resetRelay() {
		relayDraft = DEFAULT_COLLAB_RELAY_URL;
		relayTouched = true;
	}

	function errorText(err: string): string {
		if (err === 'invalid-code') return m.session_error_invalid_code();
		if (err === 'no-session') return m.session_error_no_session();
		if (err === 'session-full') return m.session_error_full();
		return m.session_error_generic({ message: err });
	}
</script>

<AppFrame>
	{#if collabGuest.status === 'ended'}
		<div class="bg-surface-50-950 flex min-h-full flex-1 items-center justify-center p-6">
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-6 text-center shadow-2xl">
				<h1 class="mb-2 text-xl font-semibold">{m.session_ended_title()}</h1>
				<p class="text-muted mb-5 text-sm">
					{collabGuest.endedReason === 'host-ended' ? m.session_ended_host() : m.session_ended_error()}
				</p>
				<button class="btn preset-filled-primary-500" onclick={backHome}>{m.session_back_home()}</button>
			</div>
		</div>
	{:else}
		<div class="bg-surface-50-950 flex min-h-full flex-1 items-center justify-center p-6">
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-6 shadow-2xl">
				<h1 class="mb-1 text-xl font-semibold">{m.session_join_title()}</h1>
				<p class="text-muted mb-5 text-sm">{m.session_join_desc()}</p>
				<label class="mb-3 block">
					<span class="mb-1 block text-sm font-medium">{m.session_code_label()}</span>
					<input
						class="input w-full font-mono tracking-wide uppercase"
						placeholder="ABCDE-FGHJK-MNPQR-STVWX-YZ234-5"
						autocapitalize="characters"
						autocomplete="off"
						spellcheck="false"
						value={codeInput}
						oninput={onCodeInput}
						onkeydown={(e) => e.key === 'Enter' && !joinDisabled && join()}
					/>
				</label>
				<label class="mb-3 block">
					<span class="mb-1 block text-sm font-medium">{m.session_name_label()}</span>
					<input
						bind:this={nameEl}
						class="input w-full"
						maxlength={40}
						bind:value={nameInput}
						onkeydown={(e) => e.key === 'Enter' && !joinDisabled && join()}
					/>
				</label>
				{#if collabGuest.joinError}
					<p class="text-error-ink mb-3 text-sm">{errorText(collabGuest.joinError)}</p>
				{/if}

				<!-- the browser build pins the relay: its CSP only allows the official one, so a custom
				     address here would fail silently -->
				{#if !__WEB__}
					<!-- plumbing almost nobody changes: collapsed unless they're already on a custom relay -->
					<button
						type="button"
						class="text-muted hover:text-surface-950-50 inline-flex items-center gap-1 text-xs"
						onclick={() => (advancedOpen = !advancedOpen)}
					>
						<ChevronDown class="size-3.5 transition-transform {advancedOpen ? '' : '-rotate-90'}" />
						{m.session_relay_label()}
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
					{/if}
				{/if}

				<p class="text-muted border-surface-200-800 mt-4 flex items-start gap-1.5 border-t pt-3 text-xs">
					<ShieldCheck class="text-success-ink mt-px size-3.5 shrink-0" />
					<span>{m.collab_e2ee_note()}</span>
				</p>

				<div class="mt-4 flex justify-end gap-2">
					<!-- nowhere to cancel TO in the browser build: this screen is the whole app -->
					{#if !__WEB__}
						<button class="btn preset-tonal" onclick={() => navigate('/')}>{m.session_cancel()}</button>
					{/if}
					{#if __WEB__ && isValidShareCode(codeInput)}
						<!-- stacked, not side by side: two labels of different lengths made a lopsided row, and
						     stacking also lets the app option keep the full width it deserves as the lead. -->
						<div class="flex w-full flex-col gap-2">
							<button class="btn preset-filled-primary-500 w-full" onclick={openInApp}>
								<ExternalLink class="size-4" />
								{m.session_open_in_app()}
							</button>
							<button class="btn preset-tonal w-full" disabled={joinDisabled} onclick={join}>
								{collabGuest.status === 'joining' ? m.session_joining() : m.session_join_here()}
							</button>
						</div>
					{:else}
						<button class="btn preset-filled-primary-500" disabled={joinDisabled} onclick={join}>
							{collabGuest.status === 'joining' ? m.session_joining() : m.session_join_button()}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</AppFrame>

{#if __WEB__}
	<Modal bind:open={appModalOpen} title={m.session_app_missing_title()}>
		<p class="text-muted mb-4 text-sm">{m.session_app_missing_body()}</p>
		<ModalActions
			buttons={[
				{ label: m.session_continue_browser(), onclick: continueInBrowser, class: 'preset-tonal' },
				{ label: m.session_download(), role: 'primary', href: 'https://texpile.com/download' }
			]}
		/>
	</Modal>
{/if}
