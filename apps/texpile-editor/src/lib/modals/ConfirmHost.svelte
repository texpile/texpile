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
	<Modal
		title={prompt.title}
		card="max-h-full max-w-sm overflow-y-auto p-5"
		alert
		dismissable={prompt.cancelId !== undefined}
		onClose={dismissPrompt}
		onEnter={primary ? () => answerPrompt(primary.id) : undefined}
	>
		<p class="text-surface-600-300 text-sm whitespace-pre-line">{prompt.message}</p>
		{#if prompt.detail}
			<p class="text-surface-500 mt-2 text-sm whitespace-pre-line">{prompt.detail}</p>
		{/if}
		<ModalActions
			class="mt-5"
			buttons={prompt.buttons.map((b) => ({
				label: b.label,
				role: b.primary ? 'primary' : b.id === prompt.cancelId ? 'cancel' : 'secondary',
				danger: b.primary && prompt.danger,
				onclick: () => answerPrompt(b.id)
			}))}
		/>
	</Modal>
{/if}
