<script lang="ts">
	// Draws the app's own prompt (confirm.svelte.ts decides when); mounted once at app root, like
	// the toast group. The button row orders the buttons for the platform.
	import Modal from './Modal.svelte';
	import ModalActions from './ModalActions.svelte';
	import { promptDialog, dismissPrompt, answerPrompt } from './confirm.svelte';

	const prompt = $derived(promptDialog.state);
	const primary = $derived(prompt?.buttons.find((b) => b.primary) ?? null);
</script>

{#if prompt}
	<!-- above every other dialog: a prompt is asked from inside one (Preferences, Local History) and
	     drawn on the same layer it would sit behind it -->
	<Modal
		title={prompt.title}
		z="z-1500"
		card="max-h-full max-w-sm overflow-y-auto p-5"
		alert
		dismissable={prompt.cancelId !== undefined}
		onClose={dismissPrompt}
		onEnter={primary ? () => answerPrompt(primary.id) : undefined}
	>
		<!-- as the native box sets them: the question, then what follows from it, smaller and quieter -->
		<p class="text-sm whitespace-pre-line">{prompt.message}</p>
		{#if prompt.detail}
			<p class="text-muted mt-2 text-xs whitespace-pre-line">{prompt.detail}</p>
		{/if}
		<ModalActions
			class="mt-5"
			size="xs"
			buttons={prompt.buttons.map((b) => ({
				label: b.label,
				role: b.primary ? 'primary' : b.id === prompt.cancelId ? 'cancel' : 'secondary',
				danger: b.primary && prompt.danger,
				onclick: () => answerPrompt(b.id)
			}))}
		/>
	</Modal>
{/if}
