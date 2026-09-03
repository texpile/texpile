<script lang="ts">
	// The in-app Zotero picker: search the library (Better BibTeX's item.search, through the
	// bridge), collect any number of entries, insert once. Shell and widgets follow the command
	// palette - same overlay, same Combobox - so the two dialogs feel like one family.
	//
	// Selection is a TOGGLE and the list stays open: citing several works at once is the normal
	// case, and closing on first pick would turn that into three round trips.
	import { tip } from '$lib/components/tooltip.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Combobox, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { BookMarked, Check, X } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { references } from '$lib/workspace/citations';
	import { zoteroPicker } from './pickerState.svelte';
	import { applyPickedCitations } from './insertFromZotero';
	import { m } from '$lib/paraglide/messages';

	type Hit = {
		citekey: string;
		title: string;
		author: string;
		year: string;
		/** which shelf the row came from; drives the group headers of the untyped view */
		source?: 'project' | 'library';
	};

	let query = $state('');
	let results = $state<Hit[]>([]);
	const selected = new SvelteMap<string, Hit>();
	let searched = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let gen = 0;

	// fresh state every open; gen invalidates any search still in flight from the last session.
	// The empty search fires immediately: item.search('') is the whole library (capped), which
	// is what fills the untyped view below the project's own entries.
	$effect(() => {
		if (!zoteroPicker.open) return;
		query = '';
		results = [];
		selected.clear();
		searched = false;
		gen++;
		void run('');
	});

	function schedule(q: string): void {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void run(q), 250);
	}

	async function run(q: string): Promise<void> {
		const my = ++gen;
		const res = await window.texpileZotero?.search(q.trim());
		if (my !== gen || !zoteroPicker.open) return; // superseded or closed while waiting
		results = (res?.ok ? (res.items ?? []) : []).map((h) => ({ ...h, source: 'library' as const }));
		searched = true;
	}

	// The project's own bibliography leads the untyped view: most citations are re-citations,
	// and these rows insert with no Zotero round trip (the append pipeline skips keys the bib
	// already has). The library listing follows, from the empty search fired at open.
	// braces are BibTeX case-protection ({{Communication}}); they mean something to the compiler
	// and nothing to a reader
	function display(s: string) {
		return s.replace(/[{}]/g, '');
	}
	const projectHits = $derived(
		references.current.slice(0, 200).map((r): Hit => ({
			citekey: r.key,
			title: display(r.title ?? ''),
			author: display((r.author ?? '').split(' and ')[0] ?? ''),
			year: r.year ?? (r.date ?? '').slice(0, 4),
			source: 'project'
		}))
	);
	// untyped: the project's entries, then the rest of the Zotero library (entries the project
	// already has stay under their project heading only). Typed: the live search alone.
	const shown = $derived.by(() => {
		if (query.trim()) return results;
		const have = new Set(projectHits.map((h) => h.citekey));
		return [...projectHits, ...results.filter((h) => !have.has(h.citekey))];
	});

	const collection = $derived(
		useListCollection<Hit>({
			items: shown,
			itemToString: (h) => h.title || h.citekey,
			itemToValue: (h) => h.citekey
		})
	);

	function toggle(key: string | undefined): void {
		if (!key) return;
		const hit = shown.find((h) => h.citekey === key) ?? selected.get(key);
		if (!hit) return;
		if (selected.has(key)) selected.delete(key);
		else selected.set(key, hit);
	}

	function insert(): void {
		const deps = zoteroPicker.deps;
		const keys = [...selected.keys()];
		zoteroPicker.hide();
		if (deps && keys.length) void applyPickedCitations(keys, deps);
	}

	// capture phase, exactly as the palette: the Combobox input owns these keys in the bubble
	// phase, so Escape (close) and bare Enter (insert what is collected) must run before it
	function onWindowKeydownCapture(e: KeyboardEvent): void {
		if (!zoteroPicker.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			zoteroPicker.hide();
			return;
		}
		if (e.key === 'Enter' && !query.trim() && selected.size) {
			e.preventDefault();
			e.stopPropagation();
			insert();
		}
	}

	/** group header before row i of the untyped view, when its shelf differs from the row above */
	function headerOf(i: number): 'project' | 'library' | null {
		if (query.trim()) return null;
		const s = shown[i]?.source ?? null;
		return s && (i === 0 || shown[i - 1]?.source !== s) ? s : null;
	}

	// check LAST, not first: a leading slot that is empty on every unselected row reads as the
	// left edge carrying more padding than the right
	const rowClass =
		'grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-base px-2.5 py-1.5 text-sm data-[highlighted]:preset-tonal';
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

{#if zoteroPicker.open}
	<div
		class="app-scrim fixed inset-0 z-1300 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && zoteroPicker.hide()}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden border shadow-2xl">
			<Combobox
				class="flex min-h-0 w-full flex-col"
				{collection}
				inputValue={query}
				onInputValueChange={(d) => {
					query = d.inputValue;
					schedule(query);
				}}
				onValueChange={(d) => toggle(d.value[0])}
				inputBehavior="autohighlight"
				selectionBehavior="preserve"
				value={[]}
				open={true}
			>
				<Combobox.Control class="border-surface-200-800 flex items-center gap-2 border-b px-3 py-2">
					<BookMarked class="text-muted size-4 shrink-0" />
					<Combobox.Input
						class="placeholder:text-muted w-full bg-transparent text-sm outline-none"
						placeholder={m.zotero_dialog_placeholder()}
						autocomplete="off"
						spellcheck="false"
					/>
				</Combobox.Control>

				{#if selected.size > 0}
					<div class="border-surface-200-800 flex flex-wrap gap-1.5 border-b px-3 py-2">
						{#each [...selected.values()] as hit (hit.citekey)}
							<span class="preset-tonal flex max-w-60 items-center gap-1 rounded-base px-1.5 py-0.5 text-xs">
								<span class="truncate">{hit.title || hit.citekey}</span>
								<button
									class="hover:text-error-500 shrink-0"
									onclick={() => toggle(hit.citekey)}
									use:tip={m.zotero_dialog_remove()}
									aria-label={m.zotero_dialog_remove()}
								>
									<X class="size-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}

				{#if shown.length === 0}
					<div class="text-muted px-3 py-10 text-center text-sm">
						{searched && query.trim() ? m.zotero_dialog_empty() : m.zotero_dialog_type_hint()}
					</div>
				{:else}
					<Combobox.Content class="min-h-0 overflow-y-auto border-none bg-transparent p-1.5">
						{#each shown as hit, i (hit.citekey)}
							{@const header = headerOf(i)}
							{#if header}
								<div class="text-muted px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wider uppercase">
									{header === 'project' ? m.zotero_dialog_group_project() : m.zotero_dialog_group_library()}
								</div>
							{/if}
							<Combobox.Item class={rowClass} item={hit}>
								<Combobox.ItemText class="truncate">{hit.title || hit.citekey}</Combobox.ItemText>
								<span class="text-muted max-w-56 truncate text-xs">
									{[hit.author, hit.year ? `(${hit.year})` : ''].filter(Boolean).join(' ')}
								</span>
								{#if selected.has(hit.citekey)}
									<Check class="text-primary-500 size-4 shrink-0" />
								{:else}
									<span class="size-4 shrink-0"></span>
								{/if}
							</Combobox.Item>
						{/each}
					</Combobox.Content>
				{/if}

				<div class="border-surface-200-800 text-muted flex items-center gap-3 border-t px-3 py-1.5 text-xs">
					<span><Kbd cap keys="enter" /> {m.zotero_dialog_hint_toggle()}</span>
					<span><Kbd cap keys="esc" /> {m.palette_hint_close()}</span>
					<span class="flex-1"></span>
					<button class="btn btn-xs preset-filled-primary-500" disabled={selected.size === 0} onclick={insert}>
						{m.zotero_dialog_insert()}{selected.size ? ` (${selected.size})` : ''}
					</button>
				</div>
			</Combobox>
		</div>
	</div>
{/if}
