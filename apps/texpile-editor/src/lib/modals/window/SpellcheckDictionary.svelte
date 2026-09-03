<!-- custom dictionary editor; the linter helpers keep Harper's in-memory dictionary in sync -->
<script lang="ts">
	import { X } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { editorConfigStore } from '$lib/stores/editorStore';
	import { addWordToDocumentDictionary, removeWordFromDocumentDictionary } from '$lib/editor/spellcheck/harper';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let newWord = $state('');
	const words = $derived([...(editorConfigStore.current?.dictionary ?? [])].sort((a, b) => a.localeCompare(b)));

	async function add() {
		const w = newWord.trim();
		if (!w) return;
		newWord = '';
		await addWordToDocumentDictionary(w);
	}
</script>

<Modal bind:open title={m.spelldict_heading()} card="flex max-h-[80vh] max-w-md flex-col p-4">
	<div class="mb-3 flex gap-2">
		<input
			bind:value={newWord}
			class="input flex-1"
			placeholder={m.spelldict_add_word_placeholder()}
			spellcheck="false"
			onkeydown={(e) => {
				if (e.key === 'Enter') add();
			}}
		/>
		<button class="btn btn-xs preset-filled-primary-500" type="button" onclick={add} disabled={!newWord.trim()}
			>{m.spelldict_add_button()}</button
		>
	</div>

	<ul class="min-h-0 flex-1 overflow-y-auto">
		{#each words as word (word)}
			<li class="border-surface-200-800 flex items-center justify-between border-b py-1.5 text-sm last:border-b-0">
				<span class="truncate">{word}</span>
				<button
					class="btn-icon btn-icon-xs hover:preset-tonal opacity-60 hover:opacity-100"
					type="button"
					aria-label={m.spelldict_remove_word_label({ word })}
					onclick={() => removeWordFromDocumentDictionary(word)}
				>
					<X class="size-4" />
				</button>
			</li>
		{:else}
			<li class="text-muted py-4 text-center text-sm">{m.spelldict_empty_state()}</li>
		{/each}
	</ul>
</Modal>
