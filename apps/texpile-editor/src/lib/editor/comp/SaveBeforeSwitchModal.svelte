<script lang="ts">
	// Autosave off + unsaved edits, and the user is switching away: keep, drop, or stay put.
	// Three outcomes, so this can't be the boolean confirmAsk(): the X / backdrop / Escape all
	// CANCEL the switch (stay on the current file with the edit intact), not save it.
	import { X } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let { name, onResolve }: { name: string; onResolve: (choice: 'save' | 'discard' | 'cancel') => void } = $props();
</script>

<div
	class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
	role="presentation"
	onmousedown={(e) => e.target === e.currentTarget && onResolve('cancel')}
>
	<!-- svelte-ignore a11y_autofocus -->
	<div
		class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl"
		role="alertdialog"
		aria-modal="true"
		tabindex="-1"
		autofocus
		onkeydown={(e) => {
			if (e.key === 'Escape') onResolve('cancel');
			else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) onResolve('save');
		}}
	>
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-lg font-semibold">{m.wsview_unsaved_title()}</h2>
			<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => onResolve('cancel')} aria-label={m.menubar_prompt_cancel()}>
				<X class="size-4" />
			</button>
		</div>
		<p class="text-surface-600-300 text-sm">{m.wsview_confirm_save_before_switch({ name })}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button class="btn hover:preset-tonal" type="button" onclick={() => onResolve('discard')}>{m.vcs_discard_changes()}</button>
			<button class="btn preset-filled-primary-500" type="button" onclick={() => onResolve('save')}>{m.wsview_save_label()}</button>
		</div>
	</div>
</div>
