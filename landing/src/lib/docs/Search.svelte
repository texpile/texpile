<script lang="ts">
	// Ctrl K / Cmd K search over page titles, descriptions and ## headings. The index is a static
	// JSON file fetched on first open, so pages that are only read never download it.
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { untrack } from 'svelte';
	import FileText from '@lucide/svelte/icons/file-text';
	import Hash from '@lucide/svelte/icons/hash';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { SearchEntry } from './blocks';
	import { search } from './searchState.svelte';

	type Hit = { href: string; title: string; context: string; heading: boolean };

	let query = $state('');
	let selected = $state(0);
	let entries = $state<SearchEntry[] | null>(null);
	let input = $state<HTMLInputElement>();
	$effect(() => {
		if (!search.open) return;
		untrack(() => {
			query = '';
			selected = 0;
			if (!entries) load();
		});
		input?.focus();
	});

	// the page stays put behind the dialog
	$effect(() => {
		if (!search.open) return;
		const html = document.documentElement;
		const before = html.style.overflow;
		html.style.overflow = 'hidden';
		return () => (html.style.overflow = before);
	});

	function load() {
		fetch('/docs/search.json')
			.then((r) => r.json())
			.then((e: SearchEntry[]) => (entries = e));
	}

	const hits = $derived.by((): Hit[] => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (!entries || !words.length) return [];
		const has = (s: string) => words.every((w) => s.toLowerCase().includes(w));
		const scored: (Hit & { score: number })[] = [];
		for (const e of entries) {
			const where = e.parent ? `${e.parent} › ${e.title}` : e.title;
			const title = e.parent ? `${e.title} ${e.parent}` : e.title;
			if (has(title))
				scored.push({
					href: e.href,
					title: e.title,
					context: e.parent ?? '',
					heading: false,
					score: e.title.toLowerCase().startsWith(words[0]) ? 30 : 20
				});
			else if (has(`${title} ${e.description}`))
				scored.push({ href: e.href, title: e.title, context: e.parent ?? '', heading: false, score: 5 });
			for (const h of e.headings) {
				if (has(h.text) || has(`${h.text} ${title}`))
					scored.push({ href: `${e.href}#${h.id}`, title: h.text, context: where, heading: true, score: has(h.text) ? 10 : 8 });
			}
		}
		const top = scored.sort((a, b) => b.score - a.score).slice(0, 12);
		return [...top.filter((h) => !h.heading), ...top.filter((h) => h.heading)];
	});

	$effect(() => {
		void query;
		selected = 0;
	});

	// the app's Kbd cap: at least square, with the lower edge a real key has
	const KEY =
		'text-surface-700-300 border-surface-300-700 bg-surface-100-900 rounded-base inline-flex font-[inherit] h-5 min-w-5 items-center justify-center border text-xs leading-none shadow-[0_1px_0_var(--color-surface-300-700)]';

	let isMac = $state(false);
	$effect(() => {
		isMac = /Mac|iPhone|iPad/.test(navigator.platform);
	});

	// pages first, then sections, each row keeping its place in the keyboard order
	const groups = $derived.by(() => {
		const indexed = hits.map((h, index) => ({ ...h, index }));
		return [
			{ label: 'Pages', hits: indexed.filter((h) => !h.heading) },
			{ label: 'Sections', hits: indexed.filter((h) => h.heading) }
		].filter((g) => g.hits.length);
	});

	/** the text split into runs, the typed words marked */
	function runs(text: string): { text: string; hit: boolean }[] {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return [{ text, hit: false }];
		const lower = text.toLowerCase();
		const mark = new Array(text.length).fill(false);
		for (const w of words)
			for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) for (let j = i; j < i + w.length; j++) mark[j] = true;
		const out: { text: string; hit: boolean }[] = [];
		for (let i = 0; i < text.length; i++) {
			const last = out[out.length - 1];
			if (last && last.hit === mark[i]) last.text += text[i];
			else out.push({ text: text[i], hit: mark[i] });
		}
		return out;
	}

	function go(hit: Hit | undefined) {
		if (!hit) return;
		search.open = false;
		goto(localizeHref(hit.href));
	}

	function onWindowKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			search.open = !search.open;
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = Math.min(selected + 1, hits.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			go(hits[selected]);
		} else if (e.key === 'Escape') {
			search.open = false;
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet marked(text: string)}
	{#each runs(text) as run, r (r)}{#if run.hit}<span class="text-primary-600 font-semibold">{run.text}</span>{:else}{run.text}{/if}{/each}
{/snippet}

<!-- Texpile's own command palette, class for class (apps/texpile-editor/src/lib/palette/CommandPalette.svelte),
     so Ctrl K looks the same on the site as in the app. The app's UI font is the system font. -->
{#if search.open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
		style="font-family: system-ui, sans-serif"
		onclick={() => (search.open = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="card bg-surface-50-950 border-surface-300-700 flex max-h-[70vh] w-full max-w-xl flex-col overflow-clip border shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Search the docs"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="border-surface-200-800 flex items-center gap-2 border-b px-3 py-2">
				<SearchIcon class="text-surface-500 size-4 shrink-0" />
				<input
					bind:this={input}
					bind:value={query}
					onkeydown={onInputKey}
					type="text"
					placeholder="Search the docs"
					aria-label="Search the docs"
					autocomplete="off"
					spellcheck="false"
					class="placeholder:text-surface-500 rounded-base border-primary-500 w-full border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-0"
				/>
			</div>
			{#if !entries}
				<div class="text-surface-500 px-3 py-10 text-center text-sm">{'Loading…'}</div>
			{:else if !hits.length}
				<div class="text-surface-500 px-3 py-10 text-center text-sm">{query.trim() ? 'No matching pages' : 'Type to search the docs'}</div>
			{:else}
				<div class="min-h-0 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain p-1.5">
					{#each groups as group (group.label)}
						<div class="text-surface-500 px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wider uppercase">{group.label}</div>
						{#each group.hits as hit (hit.index)}
							<a
								href={localizeHref(hit.href)}
								onclick={(e) => {
									e.preventDefault();
									go(hit);
								}}
								onmousemove={() => (selected = hit.index)}
								class="rounded-base grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-2.5 py-1.5 text-sm {hit.index === selected
									? 'preset-tonal'
									: ''}"
							>
								{#if hit.heading}
									<Hash class="text-surface-500 size-4 shrink-0" />
								{:else}
									<FileText class="text-surface-500 size-4 shrink-0" />
								{/if}
								<span class="truncate">{@render marked(hit.title)}</span>
								{#if hit.context}
									<span class="text-surface-500 max-w-56 truncate text-xs">{hit.context}</span>
								{/if}
							</a>
						{/each}
					{/each}
				</div>
			{/if}
			<div class="border-surface-200-800 text-surface-500 flex gap-3 border-t px-3 py-1.5 text-xs">
				<span class="flex items-center gap-1"
					><kbd class="{KEY} px-1"><ArrowUp class="size-3" /></kbd><kbd class="{KEY} px-1"><ArrowDown class="size-3" /></kbd>
					{'Navigate'}</span
				>
				<span class="ml-auto flex items-center gap-1"><kbd class="{KEY} px-1.5">{isMac ? '↵' : 'Enter'}</kbd> {'Open'}</span>
				<span class="flex items-center gap-1"><kbd class="{KEY} px-1.5">{isMac ? '⎋' : 'Esc'}</kbd> {'Close'}</span>
			</div>
		</div>
	</div>
{/if}
