<script lang="ts">
	// Typst templates from Typst Universe. Says up front that it goes online: opening it is the only
	// thing that fetches the list, and picking one downloads that template.
	import { Globe, Loader2, Search, WifiOff } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import UniverseCard from './UniverseCard.svelte';
	import { universeGallery } from './universeGallery.svelte';
	import { m } from '$lib/paraglide/messages';

	const status = $derived(universeGallery.status);

	let field = $state<HTMLInputElement>();
	$effect(() => {
		if (universeGallery.open) queueMicrotask(() => field?.focus());
	});
</script>

{#if universeGallery.open}
	<Modal
		title={m.gallery_title()}
		icon={Globe}
		onClose={() => universeGallery.hide()}
		card="flex h-[80vh] max-h-full max-w-3xl flex-col p-5"
	>
		<p class="text-muted text-xs">{m.gallery_online_note()}</p>
		<label class="input mt-3 flex items-center gap-2">
			<Search class="text-muted size-4 shrink-0" />
			<input
				bind:this={field}
				class="w-full bg-transparent text-sm outline-none"
				placeholder={m.gallery_search_placeholder()}
				value={universeGallery.query}
				oninput={(e) => universeGallery.setQuery(e.currentTarget.value)}
				autocomplete="off"
				spellcheck="false"
			/>
		</label>

		<div class="mt-3 min-h-0 flex-1 overflow-y-auto" aria-live="polite">
			{#if status.kind === 'error'}
				<div class="text-muted mx-auto mt-12 flex max-w-sm flex-col items-center gap-3 text-center">
					<WifiOff class="size-8" />
					<p class="text-sm">{status.reason === 'offline' ? m.gallery_offline() : m.gallery_failed({ error: status.error ?? '' })}</p>
					<button class="btn btn-sm preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => void universeGallery.load()}>
						{m.gallery_retry()}
					</button>
				</div>
			{:else if status.kind === 'ready'}
				{#if universeGallery.matches.length === 0}
					<p class="text-muted mt-12 text-center text-sm">{m.gallery_no_results({ query: universeGallery.query.trim() })}</p>
				{:else}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each universeGallery.visible as t (t.name)}
							<UniverseCard template={t} />
						{/each}
					</div>
					{#if universeGallery.matches.length > universeGallery.visible.length}
						<div class="mt-3 flex justify-center">
							<button class="btn btn-sm preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => universeGallery.showMore()}>
								{m.gallery_show_more()}
							</button>
						</div>
					{/if}
				{/if}
			{:else}
				<p class="text-muted mt-12 flex items-center justify-center gap-2 text-sm">
					<Loader2 class="size-4 animate-spin" />
					<span class="cap-center">{m.gallery_loading()}</span>
				</p>
			{/if}
		</div>
	</Modal>
{/if}
