<script lang="ts">
	// The math search panel, under the caret of the equation that opened it. The equation keeps the
	// focus, so the query shown here is typed through it (mathSearchKeys.ts) and a click on a row is
	// taken before it can move the focus away.
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	import { IndentIncrease, Search } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { menuGroupLabelClass, menuItemClass, menuPanelClass } from '$lib/menus/menuStyles';
	import SymbolGlyph from '$lib/editor/symbols/SymbolPicker/SymbolGlyph.svelte';
	import { mathSearch, type MathSearchResult } from './mathSearch.svelte';
	import { drawMath } from './mathPreview';

	let panel = $state<HTMLDivElement>();
	let list = $state<HTMLUListElement>();

	// the rows go in a page at a time, ahead of the scroll and the highlight: all of them at once,
	// over a thousand in a Typst equation, held up the Tab that opens the panel for a fifth of a second
	const PAGE = 60;
	// each new list starts at its first page; scrolling adds the next
	let pages = $derived.by(() => {
		void mathSearch.results;
		return 1;
	});
	const rows = $derived(mathSearch.results.slice(0, Math.max(pages * PAGE, mathSearch.active + PAGE)));

	function onListScroll() {
		if (list && list.scrollTop + list.clientHeight >= list.scrollHeight - 200) pages++;
	}

	function keyOf(result: MathSearchResult): string {
		if (result.kind === 'tab') return 'tab';
		return `${result.section} ${result.kind === 'structure' ? result.structure.latex : result.entry.key}`;
	}

	// the highlighted row stays in sight as the arrow keys move it
	$effect(() => {
		void mathSearch.results;
		list?.querySelector(`[data-index="${mathSearch.active}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	// the panel is placed once, so it goes when what it was placed against moves
	$effect(() => {
		if (!mathSearch.showing) return;
		const close = mathSearch.close;
		function onScroll(e: Event) {
			if (!(e.target instanceof Node && panel?.contains(e.target))) close();
		}
		window.addEventListener('resize', close);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', onScroll, true);
		};
	});
</script>

{#if mathSearch.showing && mathSearch.place}
	{@const place = mathSearch.place}
	<Portal>
		<div
			bind:this={panel}
			class="{menuPanelClass} fixed z-[1400] flex max-h-96 w-80 flex-col"
			style="left: {place.left}px; {place.top !== undefined ? `top: ${place.top}px` : `bottom: ${place.bottom}px`}"
			onpointerdown={(e) => e.preventDefault()}
			role="presentation"
		>
			<div class="border-surface-200-800 mb-1 flex items-center gap-2 border-b px-2 pt-1 pb-2">
				<Search class="text-muted size-4 shrink-0" />
				<span class="min-w-0 flex-1 truncate">
					{#if mathSearch.query}{mathSearch.query}{/if}<span class="math-search-caret"></span>{#if !mathSearch.query}<span
							class="text-muted">{m.mathsearch_placeholder()}</span
						>{/if}
				</span>
			</div>
			<ul bind:this={list} class="min-h-0 overflow-y-auto" role="listbox" aria-label={m.symbols_results_aria()} onscroll={onListScroll}>
				{#each rows as result, i (keyOf(result))}
					{#if result.section && (i === 0 || rows[i - 1].section !== result.section)}
						<li class={menuGroupLabelClass} role="presentation">{result.section}</li>
					{/if}
					<!-- the keys reach the rows through the equation, which keeps the focus -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						class={menuItemClass}
						role="option"
						aria-selected={i === mathSearch.active}
						data-index={i}
						data-highlighted={i === mathSearch.active ? '' : undefined}
						onpointermove={() => (mathSearch.active = i)}
						onclick={() => mathSearch.pick(i)}
					>
						<span class="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden text-xs">
							{#if result.kind === 'tab'}
								<IndentIncrease class="text-muted size-4" />
							{:else if result.kind === 'structure'}
								<span use:drawMath={{ source: result.structure.display, syntax: 'latex' }}></span>
							{:else if result.entry.glyph}
								<SymbolGlyph glyph={result.entry.glyph} size={18} />
							{:else}
								<span use:drawMath={{ source: result.entry.command.preview, syntax: mathSearch.syntax }}></span>
							{/if}
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							{#if result.kind === 'tab'}
								<span class="truncate">{m.mathsearch_insert_tab()}</span>
							{:else if result.kind === 'structure'}
								<span class="truncate">{result.structure.label}</span>
							{:else}
								<span class="truncate font-mono text-xs">{result.entry.command.name}</span>
								{#if result.entry.note}
									<span class="text-muted truncate text-xs">{result.entry.note}</span>
								{/if}
							{/if}
						</span>
					</li>
				{:else}
					<li class="text-muted px-2.5 py-2">{m.palette_empty()}</li>
				{/each}
			</ul>
		</div>
	</Portal>
{/if}

<style>
	/* where the typed query goes on: the equation has the real caret, so this one only shows it */
	.math-search-caret {
		display: inline-block;
		width: 1px;
		height: 1.1em;
		margin-right: 1px;
		vertical-align: text-bottom;
		background: currentColor;
		animation: math-search-blink 1s steps(1) infinite;
	}
	@keyframes math-search-blink {
		50% {
			opacity: 0;
		}
	}
</style>
