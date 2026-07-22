<script lang="ts">
	// Renders the singleton confirmAsk() dialog. Mounted once at app root, like the toast group.
	// Escape / backdrop clicks dismiss it as a cancel.
	import { confirmDialog, answerConfirm, dismissConfirm } from './confirm.svelte';
	import { m } from '$lib/paraglide/messages';

	const state = $derived(confirmDialog.state);
</script>

{#if state}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && dismissConfirm()}
	>
		<!-- svelte-ignore a11y_autofocus -->
		<div
			class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl"
			role="alertdialog"
			aria-modal="true"
			tabindex="-1"
			autofocus
			onkeydown={(e) => {
				if (e.key === 'Escape') dismissConfirm();
				// Enter confirms only from the dialog body, never when a button has focus: there the
				// button's own activation runs, so Tab-to-Cancel then Enter cancels instead of confirming
				else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) answerConfirm(true);
			}}
		>
			<p class="text-surface-600-300 text-sm whitespace-pre-line">{state.message}</p>
			<div class="mt-5 flex justify-end gap-2">
				<button class="btn hover:preset-tonal" type="button" onclick={() => answerConfirm(false)}>
					{state.cancelLabel ?? m.menubar_prompt_cancel()}
				</button>
				<button
					class="btn {state.danger ? 'preset-tonal-error' : 'preset-filled-primary-500'}"
					type="button"
					onclick={() => answerConfirm(true)}
				>
					{state.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
