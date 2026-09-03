<script lang="ts">
	// preview of \printbibliography: generic formatting only, the compiled PDF has the real styling
	import { referenceStore } from '$lib/stores/editorStore';

	let { heading = 'Bibliography', selected = false }: { heading?: string; selected?: boolean } = $props();

	const LIMIT = 3;

	type Ref = Record<string, string | undefined>;

	const refs = $derived.by<Ref[]>(() => {
		const list = ((referenceStore.current ?? []) as unknown as Ref[]).slice();
		list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
		return list;
	});

	function sortKey(r: Ref) {
		return (r.author || r.editor || r.title || r.key || '').toLowerCase();
	}
	function yearOf(r: Ref) {
		return r.year || r.date?.slice(0, 4) || 'n.d.';
	}
	function container(r: Ref) {
		return r.journaltitle || r.booktitle || '';
	}
	function meta(r: Ref) {
		return [r.publisher, r.location].filter(Boolean).join(', ');
	}

	function authors(r: Ref): string {
		const list = (r.author || r.editor || '')
			.split(/\s+and\s+/i)
			.map((s) => s.trim())
			.filter(Boolean);
		if (list.length <= 1) return list[0] ?? '';
		if (list.length === 2) return `${list[0]} and ${list[1]}`;
		return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
	}
</script>

<div class="hover:bg-surface-100-900/40 my-4 rounded-base px-2 py-2 text-sm select-none {selected ? 'ring-primary-500 ring-2' : ''}">
	<div class="mb-3 text-center font-semibold">{heading}</div>
	{#if refs.length === 0}
		<div class="text-surface-500 text-center italic">No bibliography entries yet. Add references to a .bib file.</div>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each refs.slice(0, LIMIT) as r (r.key)}
				<li class="-indent-6 pl-6 leading-snug">
					{#if authors(r)}<span>{authors(r)} </span>{/if}<span class="text-surface-600-400">({yearOf(r)}). </span>{#if r.title}<em
							>{r.title}.
						</em>{/if}{#if container(r)}<span>{container(r)}. </span>{/if}{#if meta(r)}<span class="text-surface-600-400">{meta(r)}.</span
						>{/if}
				</li>
			{/each}
		</ul>
		{#if refs.length > LIMIT}
			<div class="text-surface-400 mt-2 text-center text-xs">+{refs.length - LIMIT} more</div>
		{/if}
	{/if}
</div>
