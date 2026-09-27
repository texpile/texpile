<script lang="ts">
	// Cite by DOI: paste a DOI or an arXiv ID, see the work it names, cite it. The shell follows
	// the Zotero picker and the command palette - same overlay, same card - so the three dialogs
	// read as one family.
	//
	// A paste looks up at once; typing waits for a pause, so a DOI half typed is not looked up at
	// every keystroke. Nothing is written until Cite: the preview is only a read.
	import { BookPlus, Loader2 } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { parseWorkId, type WorkId } from './doiInput';
	import { citeWork, lookUpWork, type Lookup } from './citeByDoi';
	import { citeByDoi } from './citeByDoiState.svelte';
	import { m } from '$lib/paraglide/messages';

	let input = $state('');
	let id = $state<WorkId | null>(null);
	let result = $state<Lookup | null>(null);
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
		looking = false;
		gen++;
		queueMicrotask(() => field?.focus());
	});

	function onInput(): void {
		if (timer) clearTimeout(timer);
		const next = parseWorkId(input);
		if (next?.doi === id?.doi && (result || looking)) return; // same work, respelled
		id = next;
		result = null;
		looking = false;
		gen++;
		if (!next) return;
		const wait = pasted ? 0 : 500;
		pasted = false;
		timer = setTimeout(() => void run(next), wait);
	}

	async function run(work: WorkId): Promise<void> {
		const deps = citeByDoi.deps;
		if (!deps) return;
		const my = ++gen;
		looking = true;
		const found = await lookUpWork(work, deps).catch((e: unknown) => ({
			state: 'error' as const,
			reason: 'failed' as const,
			error: e instanceof Error ? e.message : String(e)
		}));
		if (my !== gen || !citeByDoi.open) return; // superseded or closed while waiting
		looking = false;
		result = found;
	}

	const citable = $derived(result?.state === 'found' || result?.state === 'cited');

	function cite(): void {
		const deps = citeByDoi.deps;
		const found = result;
		const work = id;
		if (!deps || !found || !work || !citable) return;
		citeByDoi.hide();
		void citeWork(found, work, deps);
	}

	function errorText(r: Extract<Lookup, { state: 'error' }>): string {
		switch (r.reason) {
			case 'not-found':
				return id?.kind === 'arxiv' ? m.cite_doi_not_found_arxiv() : m.cite_doi_not_found();
			case 'no-bibtex':
				return m.cite_doi_no_bibtex();
			case 'offline':
				return m.cite_doi_offline();
			default:
				return m.cite_doi_failed({ error: r.error ?? '' });
		}
	}

	// capture phase, as the other dialogs: Escape must close before anything under the overlay sees it
	function onWindowKeydownCapture(e: KeyboardEvent): void {
		if (!citeByDoi.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			citeByDoi.hide();
		} else if (e.key === 'Enter' && citable) {
			e.preventDefault();
			e.stopPropagation();
			cite();
		}
	}
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

{#if citeByDoi.open}
	<div
		class="app-scrim fixed inset-0 z-1300 flex items-start justify-center bg-black/40 p-4 [--scrim-top:8vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && citeByDoi.hide()}
	>
		<div
			class="card bg-surface-50-950 border-surface-300-700 flex w-full max-w-xl flex-col overflow-clip border shadow-2xl"
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
			</div>

			<div class="min-h-24 px-3 py-3" aria-live="polite">
				{#if looking && id}
					<div class="text-muted flex items-center gap-2 py-6 text-sm">
						<Loader2 class="size-4 shrink-0 animate-spin" />
						<span class="truncate">{m.cite_doi_looking({ id: id.kind === 'arxiv' ? `arXiv:${id.id}` : id.doi })}</span>
					</div>
				{:else if result?.state === 'found' || result?.state === 'cited'}
					{@const r = result.state === 'found' ? result.work : result}
					<div class="rounded-base bg-surface-100-900 px-3 py-2.5">
						<div class="line-clamp-2 text-sm font-medium">{r.title || r.key}</div>
						<div class="text-muted mt-0.5 truncate text-xs">
							{[r.authors, r.venue, r.year].filter(Boolean).join(' · ')}
						</div>
						<div class="text-muted mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
							<span class="shrink-0 font-mono">{r.key}</span>
							<span aria-hidden="true">·</span>
							<span class="truncate">
								{result.state === 'found' ? m.cite_doi_adds_to({ name: result.bibName }) : m.cite_doi_already()}
							</span>
						</div>
					</div>
				{:else if result?.state === 'error'}
					<p class="text-error-ink py-6 text-sm">{errorText(result)}</p>
				{:else if input.trim() && !id}
					<p class="text-muted py-6 text-sm">{m.cite_doi_unrecognized()}</p>
				{:else}
					<p class="text-muted py-6 text-sm">{m.cite_doi_hint()}</p>
				{/if}
			</div>

			<div class="border-surface-200-800 text-muted flex items-center gap-3 border-t px-3 py-1.5 text-xs">
				<span><Kbd cap keys="enter" /> {m.cite_doi_hint_cite()}</span>
				<span><Kbd cap keys="esc" /> {m.palette_hint_close()}</span>
				<span class="flex-1"></span>
				<button class="btn btn-xs preset-filled-primary-500" disabled={!citable} onclick={cite}>{m.cite_doi_cite()}</button>
			</div>
		</div>
	</div>
{/if}
