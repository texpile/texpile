<script lang="ts">
	// shows the email with a copy button, no mail client assumed
	import Modal from '$lib/modals/Modal.svelte';
	import { m } from '$lib/paraglide/messages';

	const SUPPORT_EMAIL = 'support@texpile.com';
	let open = $state(false);
	let copied = $state(false);

	export function show(): void {
		copied = false;
		open = true;
	}

	async function copyEmail() {
		try {
			await navigator.clipboard.writeText(SUPPORT_EMAIL);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<Modal bind:open title={m.menubar_contact_support()} card="max-h-full max-w-sm overflow-y-auto p-5">
	<p class="text-muted mb-2 text-sm">{m.menubar_support_email_intro()}</p>
	<div class="border-surface-300-700 bg-surface-100-900 flex items-center justify-between gap-3 rounded-base border px-3 py-2">
		<code class="text-sm select-all">{SUPPORT_EMAIL}</code>
		<button class="btn btn-xs preset-filled-primary-500 shrink-0" onclick={copyEmail}
			>{copied ? m.menubar_copied() : m.menubar_copy()}</button
		>
	</div>
</Modal>
