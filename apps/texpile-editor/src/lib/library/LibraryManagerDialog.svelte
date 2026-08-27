<script lang="ts">
	// The personal library manager: the same visual .bib editor the project files get
	// (BibManager), bound to the user's library.bib. Every commit writes through the store to
	// the app's userData, outside any project. publishReferences stays off so editing the
	// library never clobbers the open document's citation-autocomplete store.
	import { Library, X } from '@lucide/svelte';
	import BibManager from '$lib/editor/visual/bib/BibManager.svelte';
	import { libraryManager } from './libraryManagerState.svelte';
	import { libraryStore } from './libraryStore.svelte';
	import { m } from '$lib/paraglide/messages';

	let saving = $state(false);
	let saveFailed = $state(false);

	$effect(() => {
		if (libraryManager.open) {
			saving = false;
			saveFailed = false;
			void libraryStore.load();
		}
	});

	async function onInput(v: string): Promise<void> {
		saving = true;
		saveFailed = false;
		const ok = await libraryStore.save(v);
		saving = false;
		saveFailed = !ok;
	}

	function onWindowKeydownCapture(e: KeyboardEvent): void {
		if (!libraryManager.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			libraryManager.hide();
		}
	}
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

{#if libraryManager.open}
	<div
		class="app-scrim fixed inset-0 z-1300 flex items-start justify-center bg-black/40 p-4 pt-[6vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && libraryManager.hide()}
	>
		<div
			class="card bg-surface-50-950 border-surface-300-700 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden border shadow-2xl"
		>
			<div class="border-surface-200-800 flex items-center gap-2 border-b px-4 py-2.5">
				<Library class="text-surface-500 size-4 shrink-0" />
				<h2 class="flex-1 text-sm font-semibold">{m.library_manage()}</h2>
				{#if saveFailed}
					<span class="text-error-500 text-xs">{m.library_manager_save_failed()}</span>
				{:else if saving}
					<span class="text-surface-500 text-xs">{m.library_manager_saving()}</span>
				{/if}
				<button
					class="hover:text-error-500 shrink-0"
					onclick={libraryManager.hide}
					aria-label={m.modal_close_aria()}
					title={m.modal_close_aria()}
				>
					<X class="size-4" />
				</button>
			</div>
			{#if libraryStore.error}
				<div class="text-error-500 border-error-500/20 bg-error-500/5 border-b px-4 py-2 text-xs">{libraryStore.error}</div>
			{/if}
			<div class="min-h-0 flex-1 overflow-hidden">
				{#if libraryStore.text === null}
					<div class="text-surface-500 flex h-full items-center justify-center text-sm">{m.library_manager_loading()}</div>
				{:else}
					<BibManager value={libraryStore.text} {onInput} publishReferences={false} />
				{/if}
			</div>
			<div class="border-surface-200-800 text-surface-500 border-t px-4 py-1.5 text-xs">
				{m.library_manager_note()}
			</div>
		</div>
	</div>
{/if}
