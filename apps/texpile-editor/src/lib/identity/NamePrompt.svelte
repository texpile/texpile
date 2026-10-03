<script lang="ts">
	// What to call the reader, asked the first time something needs a name and nothing has one
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import { nameAsk } from './ownName.svelte';
	import { m } from '$lib/paraglide/messages';

	let value = $state('');
	let input = $state<HTMLInputElement>();

	$effect(() => {
		if (!nameAsk.open) return;
		value = '';
		setTimeout(() => input?.focus(), 0);
	});

	function close(ok: boolean): void {
		nameAsk.answer?.(ok && value.trim() ? value.trim() : null);
	}
</script>

{#if nameAsk.open}
	<Modal onClose={() => close(false)} z="z-1400" card="max-h-full max-w-sm overflow-y-auto p-5">
		<div class="text-sm font-medium">{m.name_prompt_title()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{m.name_prompt_body()}</p>
		<input
			bind:this={input}
			class="input mt-3 w-full text-sm"
			maxlength={40}
			placeholder={m.name_prompt_placeholder()}
			bind:value
			onkeydown={(e) => {
				if (e.key === 'Enter' && value.trim()) close(true);
			}}
		/>
		<ModalActions
			class="mt-4"
			size="xs"
			buttons={[
				{ label: m.menubar_prompt_cancel(), role: 'cancel', onclick: () => close(false) },
				{ label: m.name_prompt_continue(), role: 'primary', disabled: !value.trim(), onclick: () => close(true) }
			]}
		/>
	</Modal>
{/if}
