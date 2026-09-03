<script lang="ts">
	// text prompt dialog, Electron has no window.prompt()
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import { m } from '$lib/paraglide/messages';

	let open = $state(false);
	let title = $state('');
	let value = $state('');
	let resolvePrompt: ((v: string | null) => void) | null = null;
	let input = $state<HTMLInputElement>();

	export function askText(promptTitle: string, initial = ''): Promise<string | null> {
		title = promptTitle;
		value = initial;
		open = true;
		setTimeout(() => input?.select(), 0);
		return new Promise((resolve) => (resolvePrompt = resolve));
	}

	function close(ok: boolean) {
		open = false;
		resolvePrompt?.(ok ? value : null);
		resolvePrompt = null;
	}
</script>

{#if open}
	<Modal onClose={() => close(false)} card="max-h-full max-w-sm overflow-y-auto p-4">
		<div class="mb-2 text-sm font-medium">{title}</div>
		<input
			bind:this={input}
			bind:value
			class="input w-full"
			onkeydown={(e) => {
				if (e.key === 'Enter') close(true);
			}}
		/>
		<ModalActions
			class="mt-4"
			size="xs"
			buttons={[
				{ label: m.menubar_prompt_cancel(), role: 'cancel', onclick: () => close(false) },
				{ label: m.menubar_prompt_ok(), role: 'primary', onclick: () => close(true) }
			]}
		/>
	</Modal>
{/if}
