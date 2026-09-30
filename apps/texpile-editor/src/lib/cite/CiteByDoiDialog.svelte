<script lang="ts">
	// cite by identifier or title; the Zotero picker's and command palette's shell, so the three read as one
	import { BookPlus, FileText, Loader2 } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { parseWorkId, workKey, workLabel, type WorkId } from './doiInput';
	import { citeWork, lookUpWork, searchPapers, type Hit, type Lookup, type Search } from './citeByDoi';
	import { citeByDoi } from './citeByDoiState.svelte';
	import { m } from '$lib/paraglide/messages';

	let input = $state('');
	/** the identifier typed, when it is one */
	let id = $state<WorkId | null>(null);
	let result = $state<Lookup | null>(null);
	/** a title search's papers, best first */
	let hits = $state<Hit[] | null>(null);
	let searchError = $state<Extract<Search, { state: 'error' }> | null>(null);
	let selected = $state(0);
	/** the row being looked up after it was picked, and what went wrong with the last pick */
	let picking = $state<number | null>(null);
	let pickError = $state('');
	let looking = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let gen = 0;
	let pasted = false;
	let field = $state<HTMLInputElement | null>(null);

	// fresh state every open; gen invalidates any lookup still in flight from the last session
	$effect(() => {
		if (!citeByDoi.open) return;
		input = '';
		id = null;
		result = null;
		hits = null;
		searchError = null;
		picking = null;
		pickError = '';
		looking = false;
		gen++;
		queueMicrotask(() => field?.focus());
	});

	function searchable(q: string): boolean {
		return q.length >= 3 && /\p{L}/u.test(q);
	}

	function onInput(): void {
		if (timer) clearTimeout(timer);
		const q = input.trim();
		const next = parseWorkId(q);
		if (next && id && workKey(next) === workKey(id) && (result || looking)) return; // same work, respelled
		const wait = pasted ? 0 : next ? 500 : 600;
		pasted = false;
		id = next;
		result = null;
		searchError = null;
		pickError = '';
		picking = null;
		looking = false;
		gen++;
		if (next) {
			hits = null;
			timer = setTimeout(() => void run(next), wait);
		} else if (searchable(q)) {
			// the last results stay meanwhile, so the list does not blink away under the pointer
			timer = setTimeout(() => void search(q), wait);
		} else {
			hits = null;
		}
	}

	async function run(work: WorkId): Promise<void> {
		const deps = citeByDoi.deps;
		if (!deps) return;
		const my = ++gen;
		looking = true;
		const found = await lookUpWork(work, deps).catch(failed);
		if (my !== gen || !citeByDoi.open) return; // superseded or closed while waiting
		looking = false;
		result = found;
	}

	async function search(q: string): Promise<void> {
		const my = ++gen;
		looking = true;
		const got = await searchPapers(q).catch(failed);
		if (my !== gen || !citeByDoi.open) return;
		looking = false;
		if (got.state === 'hits') {
			hits = got.hits;
			selected = 0;
		} else {
			hits = null;
			searchError = got;
		}
	}

	function failed(e: unknown) {
		return { state: 'error' as const, reason: 'failed' as const, error: e instanceof Error ? e.message : String(e) };
	}

	/** a search hit's entry, fetched only now, then cited */
	async function pick(i: number): Promise<void> {
		const deps = citeByDoi.deps;
		const hitId = hits?.[i] ? parseWorkId(hits[i].doi) : null;
		if (!deps || !hitId || picking !== null) return;
		const my = ++gen;
		picking = i;
		pickError = '';
		const found = await lookUpWork(hitId, deps).catch(failed);
		if (my !== gen || !citeByDoi.open) return;
		picking = null;
		if (found.state === 'error') {
			pickError = errorText(found, hitId);
			return;
		}
		citeByDoi.hide();
		void citeWork(found, deps);
	}

	const citable = $derived(result?.state === 'found' || result?.state === 'cited');

	function cite(): void {
		const deps = citeByDoi.deps;
		const found = result;
		if (!deps || !found || !citable) return;
		citeByDoi.hide();
		void citeWork(found, deps);
	}

	function errorText(r: Extract<Lookup, { state: 'error' }>, work: WorkId | null): string {
		const service = work?.kind === 'isbn' ? 'Open Library' : work?.kind === 'pmid' ? 'PubMed' : 'doi.org';
		switch (r.reason) {
			case 'not-found':
				switch (work?.kind) {
					case 'arxiv':
						return m.cite_doi_not_found_arxiv();
					case 'isbn':
						return m.cite_doi_not_found_isbn();
					case 'pmid':
						return m.cite_doi_not_found_pmid();
					default:
						return m.cite_doi_not_found();
				}
			case 'no-bibtex':
				return m.cite_doi_no_bibtex();
			case 'offline':
				return m.cite_doi_offline({ service });
			default:
				return m.cite_doi_failed({ service, error: r.error ?? '' });
		}
	}

	/** "He et al. · 2016 IEEE Conference on ... · 2016" */
	function byline(hit: Hit): string {
		const a = hit.authors;
		const who = a.length > 2 ? `${a[0]} et al.` : a.join(' and ');
		return [who, hit.venue, hit.year].filter(Boolean).join(' · ');
	}

	// capture phase, as the other dialogs: Escape must close before anything under the overlay sees it
	function onWindowKeydownCapture(e: KeyboardEvent): void {
		if (!citeByDoi.open) return;
		const list = !id && hits?.length ? hits : null;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			citeByDoi.hide();
		} else if (list && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			e.stopPropagation();
			selected = (selected + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			if (citable) cite();
			else if (list) void pick(selected);
			else if (!id && searchable(input.trim()) && !looking) {
				if (timer) clearTimeout(timer);
				void search(input.trim());
			}
		}
	}

	$effect(() => {
		const i = selected;
		if (hits?.length) document.querySelector(`[data-cite-hit="${i}"]`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

{#if citeByDoi.open}
	<div
		class="app-scrim fixed inset-0 z-1300 flex items-start justify-center bg-black/40 p-4 [--scrim-top:8vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && citeByDoi.hide()}
	>
		<div
			class="card bg-surface-50-950 border-surface-300-700 flex max-h-[70vh] w-full max-w-xl flex-col overflow-clip border shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={m.cite_doi_insert()}
		>
			<div class="border-surface-200-800 flex items-center gap-2 border-b px-3 py-2">
				<BookPlus class="text-muted size-4 shrink-0" />
				<input
					bind:this={field}
					bind:value={input}
					oninput={onInput}
					onpaste={() => (pasted = true)}
					class="placeholder:text-muted w-full bg-transparent text-sm outline-none"
					placeholder={m.cite_doi_placeholder()}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if looking && !id && hits}
					<Loader2 class="text-muted size-4 shrink-0 animate-spin" />
				{/if}
			</div>

			<div class="min-h-0 overflow-y-auto p-1.5" aria-live="polite">
				{#if id}
					{#if looking}
						<div class="text-muted flex items-center gap-2 px-1.5 py-4 text-sm">
							<Loader2 class="size-4 shrink-0 animate-spin" />
							<span class="truncate">{m.cite_doi_looking({ id: workLabel(id) })}</span>
						</div>
					{:else if result?.state === 'found' || result?.state === 'cited'}
						{@const r = result.state === 'found' ? result.work : result}
						<button
							class="preset-tonal rounded-base grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-2.5 py-1.5 text-left text-sm"
							onclick={cite}
							use:tip={r.title}
						>
							<FileText class="text-muted size-4 shrink-0" />
							<span class="min-w-0">
								<span class="block truncate">{r.title || r.key}</span>
								<span class="text-muted block truncate text-xs">{[r.authors, r.venue, r.year].filter(Boolean).join(' · ')}</span>
							</span>
							<span class="text-muted text-xs whitespace-nowrap">
								{result.state === 'found' ? m.cite_doi_adds_to({ name: result.bibName }) : m.cite_doi_already()}
							</span>
						</button>
					{:else if result?.state === 'error'}
						<p class="text-error-ink px-1.5 py-4 text-sm">{errorText(result, id)}</p>
					{/if}
				{:else if hits?.length}
					{#if pickError}
						<p class="text-error-ink px-1.5 py-2 text-sm">{pickError}</p>
					{/if}
					{#each hits as hit, i (hit.doi)}
						<button
							data-cite-hit={i}
							class="rounded-base grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-2.5 py-1.5 text-left text-sm"
							class:preset-tonal={i === selected}
							onmouseenter={() => (selected = i)}
							onclick={() => pick(i)}
							use:tip={hit.title}
						>
							{#if picking === i}
								<Loader2 class="text-muted size-4 shrink-0 animate-spin" />
							{:else}
								<FileText class="text-muted size-4 shrink-0" />
							{/if}
							<span class="min-w-0">
								<span class="block truncate">{hit.title}</span>
								<span class="text-muted block truncate text-xs">{byline(hit)}</span>
							</span>
							<span class="text-muted text-xs whitespace-nowrap">{hit.citedKey ? m.cite_doi_already() : ''}</span>
						</button>
					{/each}
				{:else if looking}
					<div class="text-muted flex items-center gap-2 px-1.5 py-4 text-sm">
						<Loader2 class="size-4 shrink-0 animate-spin" />
						<span class="truncate">{m.cite_search_searching({ query: input.trim() })}</span>
					</div>
				{:else if searchError}
					<p class="text-error-ink px-1.5 py-4 text-sm">
						{searchError.reason === 'offline' ? m.cite_search_offline() : m.cite_search_failed({ error: searchError.error ?? '' })}
					</p>
				{:else if hits}
					<p class="text-muted px-1.5 py-4 text-sm">{m.cite_search_none()}</p>
				{:else if input.trim() && !searchable(input.trim())}
					<p class="text-muted px-1.5 py-4 text-sm">{m.cite_search_short()}</p>
				{:else}
					<p class="text-muted px-1.5 py-4 text-sm">{m.cite_doi_hint()}</p>
				{/if}
			</div>

			<div class="border-surface-200-800 text-muted flex items-center gap-3 border-t px-3 py-1.5 text-xs">
				{#if !id && hits?.length}
					<span class="flex items-center gap-1"
						><Kbd cap keys="up" /> <Kbd cap keys="down" /> <span class="cap-center">{m.palette_hint_navigate()}</span></span
					>
				{/if}
				<span class="flex items-center gap-1"><Kbd cap keys="enter" /> <span class="cap-center">{m.cite_doi_hint_cite()}</span></span>
				<span class="flex items-center gap-1"><Kbd cap keys="esc" /> <span class="cap-center">{m.palette_hint_close()}</span></span>
				<span class="flex-1"></span>
				<button
					class="btn btn-xs preset-filled-primary-500"
					disabled={!(citable || (!id && hits?.length && picking === null))}
					onclick={() => (citable ? cite() : pick(selected))}>{m.cite_doi_cite()}</button
				>
			</div>
		</div>
	</div>
{/if}
