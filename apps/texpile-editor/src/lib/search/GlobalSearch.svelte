<script lang="ts">
	import { Search, X, ChevronDown, ChevronRight, FileText } from '@lucide/svelte';
	import { searchInFolder, basename, type SearchFileResult } from '$lib/workspace/fileSystem';
	import FindToggles from '$lib/editor/find/FindToggles.svelte';
	import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';
	import { m } from '$lib/paraglide/messages';

	let { root, onOpen, onClose }: { root: string; onOpen: (file: string, line: number) => void; onClose: () => void } = $props();

	let query = $state('');
	// no wholeWord in `show` below: fs:search takes only regex + caseSensitive
	let options = $state<FindOptions>(NO_FIND_OPTIONS);
	let results = $state<SearchFileResult[]>([]);
	let truncated = $state(false);
	let searching = $state(false);
	let error = $state<string | null>(null);
	let collapsed = $state<Record<string, boolean>>({});
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inputEl = $state<HTMLInputElement | null>(null);

	// the autofocus attribute only fires on mount (and not reliably on dynamic insertion);
	// the Ctrl+Shift+F path calls this so an already-open panel refocuses too. A seed
	// (the editor's selection) replaces the query; select() lets typing replace either way.
	export function focusInput(seed?: string) {
		if (seed?.trim()) query = seed.trim();
		inputEl?.focus();
		inputEl?.select();
	}

	const totalMatches = $derived(results.reduce((n, r) => n + r.matches.length, 0));
	const resultsText = $derived(
		totalMatches === 1
			? m.globalsearch_results_count_one({ count: totalMatches })
			: m.globalsearch_results_count_other({ count: totalMatches })
	);
	const filesText = $derived(
		results.length === 1
			? m.globalsearch_files_count_one({ count: results.length })
			: m.globalsearch_files_count_other({ count: results.length })
	);

	async function runSearch() {
		const q = query.trim();
		if (!q || !root) {
			results = [];
			truncated = false;
			error = null;
			return;
		}
		searching = true;
		const res = await searchInFolder(root, q, { caseSensitive: options.caseSensitive, regex: options.regexp });
		results = res.results;
		truncated = res.truncated;
		error = res.error ?? null;
		searching = false;
	}
	// debounced re-search on query/option changes; the void reads register the deps
	$effect(() => {
		void query;
		void options;
		clearTimeout(timer);
		timer = setTimeout(runSearch, 250);
		return () => clearTimeout(timer);
	});

	// split a result line around the matched substring for highlighting (substring mode only)
	function parts(text: string): { s: string; hit: boolean }[] {
		const q = query.trim();
		if (options.regexp || !q) return [{ s: text, hit: false }];
		const hay = options.caseSensitive ? text : text.toLowerCase();
		const needle = options.caseSensitive ? q : q.toLowerCase();
		const out: { s: string; hit: boolean }[] = [];
		let i = 0;
		while (i < text.length) {
			const idx = hay.indexOf(needle, i);
			if (idx < 0) {
				out.push({ s: text.slice(i), hit: false });
				break;
			}
			if (idx > i) out.push({ s: text.slice(i, idx), hit: false });
			out.push({ s: text.slice(idx, idx + needle.length), hit: true });
			i = idx + needle.length;
		}
		return out;
	}
</script>

<!-- min-h-0 flex-1, not h-full: this is a flex child of the sidebar, under a fixed 48px header.
     h-full asked for 100% of the WHOLE sidebar, so the column wanted 100% + 48px and flex made up
     the difference by shrinking both items in proportion - taking ~3px off the header, which is
     why the title row twitched every time you switched into search. The explorer and SCM views
     next to it already sized themselves this way. -->
<div class="flex min-h-0 flex-1 flex-col">
	<div class="border-surface-200-800 flex items-center gap-1 border-b p-2">
		<div class="find-field min-w-0 flex-1">
			<!-- the gap is on the icon: `.find-field input` zeroes the padding and outranks a utility -->
			<Search class="text-surface-400 mr-1.5 size-3.5 shrink-0" />
			<!-- svelte-ignore a11y_autofocus -->
			<input
				placeholder={m.globalsearch_placeholder()}
				bind:this={inputEl}
				bind:value={query}
				autofocus
				spellcheck="false"
				onkeydown={(e) => e.key === 'Escape' && onClose()}
			/>
			<FindToggles {options} onToggle={(key) => (options = toggledFindOption(options, key))} show={['caseSensitive', 'regexp']} />
		</div>
		<button class="find-action hover:preset-tonal" title={m.find_close()} aria-label={m.find_close()} onclick={onClose}
			><X class="size-3.5" /></button
		>
	</div>

	<div class="text-surface-500 px-2 py-1 text-xs">
		{#if searching}
			{m.globalsearch_searching()}
		{:else if error}
			<span class="text-error-500">{error}</span>
		{:else if query.trim()}
			{m.globalsearch_summary({ results: resultsText, files: filesText })}{#if truncated}
				{m.globalsearch_truncated()}{/if}
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto pb-2">
		{#each results as r (r.file)}
			<div>
				<button
					class="hover:preset-tonal-surface flex w-full items-center gap-1 px-2 py-1 text-left text-sm"
					onclick={() => (collapsed[r.file] = !collapsed[r.file])}
				>
					{#if collapsed[r.file]}<ChevronRight class="text-surface-400 size-3.5 shrink-0" />{:else}<ChevronDown
							class="text-surface-400 size-3.5 shrink-0"
						/>{/if}
					<FileText class="text-surface-400 size-3.5 shrink-0" />
					<span class="shrink-0 font-medium">{basename(r.rel)}</span>
					<span class="text-surface-400 truncate text-xs" title={r.rel}>{r.rel}</span>
					<span class="text-surface-400 ml-auto shrink-0 text-xs">{r.matches.length}</span>
				</button>
				{#if !collapsed[r.file]}
					{#each r.matches as match (match.line)}
						<button
							class="hover:preset-tonal-primary flex w-full items-baseline gap-2 py-0.5 pr-2 pl-7 text-left text-xs"
							onclick={() => onOpen(r.file, match.line)}
							title={m.globalsearch_line_title({ line: match.line })}
						>
							<span class="text-surface-400 w-8 shrink-0 text-right tabular-nums">{match.line}</span>
							<span class="truncate font-mono"
								>{#each parts(match.text.trim()) as p, i (i)}<span class={p.hit ? 'bg-warning-500/40 rounded-sm' : ''}>{p.s}</span
									>{/each}</span
							>
						</button>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
</div>
