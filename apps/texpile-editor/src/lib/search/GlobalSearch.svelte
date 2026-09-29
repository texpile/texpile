<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Search, X, ChevronDown, ChevronRight, FileText } from '@lucide/svelte';
	import ReplaceAll from '@lucide/svelte/icons/replace-all';
	import { searchInFolder, basename, type SearchFileResult } from '$lib/workspace/fileSystem';
	import FindToggles from '$lib/editor/find/FindToggles.svelte';
	import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';
	import { matcher, replaceEdits, type ReplaceSpec } from './replaceInFiles';
	import { confirmAsk } from '$lib/modals/confirm.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		root,
		onOpen,
		onClose,
		onReplace
	}: {
		root: string;
		onOpen: (file: string, line: number) => void;
		onClose: () => void;
		/** absent where the folder cannot be written (a guest, a single file) */
		onReplace?: (files: string[], spec: ReplaceSpec) => Promise<void>;
	} = $props();

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
	let showReplace = $state(false);
	let replacement = $state('');
	let replaceEl = $state<HTMLInputElement | null>(null);
	let replacing = $state(false);

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

	const spec = $derived<ReplaceSpec>({
		query: query.trim(),
		replacement,
		regex: options.regexp,
		caseSensitive: options.caseSensitive
	});
	const previewing = $derived(showReplace && !!onReplace);

	/** characters of a line kept before its first match */
	const LEAD = 16;

	function parts(text: string): { s: string; hit: boolean; with?: string }[] {
		const re = matcher(spec);
		if (!re) return [{ s: text, hit: false }];
		const out: { s: string; hit: boolean; with?: string }[] = [];
		let i = 0;
		for (const found of text.matchAll(re)) {
			if (!found[0]) continue; // an empty match (^, \b) has nothing to show struck out
			const at = found.index ?? 0;
			if (at > i) out.push({ s: text.slice(i, at), hit: false });
			out.push({ s: found[0], hit: true, with: spec.regex ? expand(spec.replacement, found) : spec.replacement });
			i = at + found[0].length;
		}
		if (i < text.length) out.push({ s: text.slice(i), hit: false });
		// a match far into a long line would sit past the panel's edge: start a little before it
		if (out.length > 1 && !out[0].hit && out[0].s.length > LEAD) out[0] = { s: `…${out[0].s.slice(-LEAD)}`, hit: false };
		return out;
	}

	/** a regex replacement's $1, $<name>, $& and $$ for one match, as String.replace reads them */
	function expand(template: string, found: RegExpExecArray | RegExpMatchArray): string {
		return template.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, what: string, name?: string) => {
			if (what === '$') return '$';
			if (what === '&') return found[0];
			if (name !== undefined) return found.groups?.[name] ?? '';
			return found[Number(what)] ?? all;
		});
	}

	function toggleReplace(): void {
		showReplace = !showReplace;
		if (showReplace) setTimeout(() => replaceEl?.focus(), 0);
	}

	/** asks first, since other files are rewritten on disk */
	async function replaceIn(files: SearchFileResult[]): Promise<void> {
		if (!onReplace || replacing || !files.length || truncated) return;
		// matches, not lines, counted as the replace makes them
		const count = files.reduce((n, r) => n + r.matches.reduce((k, line) => k + Math.max(1, replaceEdits(line.text, spec).length), 0), 0);
		const results = count === 1 ? m.globalsearch_results_count_one({ count }) : m.globalsearch_results_count_other({ count });
		const names = files.length === 1 ? basename(files[0].rel) : m.globalsearch_files_count_other({ count: files.length });
		const ok = await confirmAsk(m.globalsearch_replace_confirm({ results, files: names, replacement: spec.replacement }), {
			confirmLabel: m.find_replace(),
			cancelLabel: m.menubar_prompt_cancel()
		});
		if (!ok) return;
		replacing = true;
		try {
			await onReplace(
				files.map((r) => r.file),
				spec
			);
		} finally {
			replacing = false;
			void runSearch();
		}
	}
</script>

<!-- min-h-0 flex-1, not h-full: this is a flex child of the sidebar, under a fixed 48px header.
     h-full asked for 100% of the WHOLE sidebar, so the column wanted 100% + 48px and flex made up
     the difference by shrinking both items in proportion - taking ~3px off the header, which is
     why the title row twitched every time you switched into search. The explorer and SCM views
     next to it already sized themselves this way. -->
<div class="flex min-h-0 flex-1 flex-col">
	<div class="border-surface-200-800 flex items-start gap-1 border-b p-2">
		{#if onReplace}
			<button
				type="button"
				class="find-action hover:preset-tonal"
				aria-expanded={showReplace}
				use:tip={m.find_toggle_replace()}
				aria-label={m.find_toggle_replace()}
				onclick={toggleReplace}
			>
				{#if showReplace}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}
			</button>
		{/if}
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<div class="find-field min-w-0">
				<!-- the gap is on the icon: `.find-field input` zeroes the padding and outranks a utility -->
				<Search class="text-faint mr-1.5 size-3.5 shrink-0" />
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
			{#if showReplace && onReplace}
				<div class="flex items-center gap-1">
					<div class="find-field min-w-0 flex-1">
						<input
							bind:this={replaceEl}
							bind:value={replacement}
							placeholder={m.find_replace_placeholder()}
							aria-label={m.find_replace_placeholder()}
							spellcheck="false"
							onkeydown={(e) => {
								if (e.key === 'Escape') onClose();
								else if (e.key === 'Enter') {
									e.preventDefault();
									void replaceIn(results);
								}
							}}
						/>
					</div>
					<button
						type="button"
						class="find-action hover:preset-tonal"
						use:tip={truncated ? m.globalsearch_replace_too_many() : m.globalsearch_replace_all()}
						aria-label={m.globalsearch_replace_all()}
						disabled={!results.length || truncated || replacing}
						onclick={() => replaceIn(results)}><ReplaceAll class="size-3.5" /></button
					>
				</div>
			{/if}
		</div>
		<button class="find-action hover:preset-tonal" use:tip={m.find_close()} aria-label={m.find_close()} onclick={onClose}
			><X class="size-3.5" /></button
		>
	</div>

	<div class="text-muted px-2 py-1 text-xs">
		{#if searching}
			{m.globalsearch_searching()}
		{:else if error}
			<span class="text-error-ink">{error}</span>
		{:else if query.trim()}
			{m.globalsearch_summary({ results: resultsText, files: filesText })}{#if truncated}
				{m.globalsearch_truncated()}{/if}
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] pb-2">
		{#each results as r (r.file)}
			<div class="group/file relative">
				{#if previewing && !truncated}
					<button
						type="button"
						class="find-action hover:preset-tonal bg-surface-50-950 invisible absolute top-0.5 right-1 group-focus-within/file:visible group-hover/file:visible"
						use:tip={m.globalsearch_replace_file()}
						aria-label={m.globalsearch_replace_file()}
						disabled={replacing}
						onclick={() => replaceIn([r])}><ReplaceAll class="size-3.5" /></button
					>
				{/if}
				<button
					class="hover:preset-tonal-surface flex w-full items-center gap-1 px-2 py-1 text-left text-sm"
					onclick={() => (collapsed[r.file] = !collapsed[r.file])}
				>
					{#if collapsed[r.file]}<ChevronRight class="text-faint size-3.5 shrink-0" />{:else}<ChevronDown
							class="text-faint size-3.5 shrink-0"
						/>{/if}
					<FileText class="text-faint size-3.5 shrink-0" />
					<span class="shrink-0 font-medium">{basename(r.rel)}</span>
					<span class="text-faint truncate text-xs" use:tip={r.rel}>{r.rel}</span>
					<span class="text-faint ml-auto shrink-0 text-xs">{r.matches.length}</span>
				</button>
				{#if !collapsed[r.file]}
					{#each r.matches as match (match.line)}
						<button
							class="hover:preset-tonal flex w-full items-baseline gap-2 py-0.5 pr-2 pl-7 text-left text-xs"
							onclick={() => onOpen(r.file, match.line)}
							use:tip={m.globalsearch_line_title({ line: match.line })}
						>
							<span class="text-faint w-8 shrink-0 text-right tabular-nums">{match.line}</span>
							<span class="truncate font-mono"
								>{#each parts(match.text.trim()) as p, i (i)}{#if p.hit && previewing}<del class="replace-old rounded-base">{p.s}</del><ins
											class="replace-new rounded-base">{p.with}</ins
										>{:else}<span class={p.hit ? 'bg-warning-wash rounded-base' : ''}>{p.s}</span>{/if}{/each}</span
							>
						</button>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	/* drawn as suggestion mode draws a suggested edit (cmSuggestions.ts), so the two read as one thing */
	.replace-old {
		background-color: color-mix(in srgb, var(--diff-delete-tint) 16%, transparent);
		color: color-mix(in srgb, currentColor 70%, transparent);
		text-decoration: line-through;
	}
	.replace-new {
		background-color: color-mix(in srgb, var(--diff-insert-tint) 18%, transparent);
		text-decoration: none;
	}
</style>
