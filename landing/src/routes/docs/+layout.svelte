<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Menu from '@lucide/svelte/icons/menu';
	import { page } from '$app/state';
	import { hrefFor, lookup, navGroups, type NavNode } from '$lib/docs/nav';
	import Search from '$lib/docs/Search.svelte';
	import SearchButton from '$lib/docs/SearchButton.svelte';

	let { data, children } = $props();

	// params, not url.pathname: the localized routes (/zh-Hans/docs/latex/equations) reroute to the
	// same route, so this stays correct in every locale
	const slug = $derived(page.params.slug ?? '');
	const active = $derived(lookup(data.nav, slug));

	const groups = $derived(navGroups(data.nav));

	// keep the current page in view in the sidebar: scroll the sidebar itself, never the page
	let sideNav = $state<HTMLElement>();
	$effect(() => {
		void slug;
		const nav = sideNav;
		if (!nav) return;
		requestAnimationFrame(() => {
			const here = nav.querySelector<HTMLElement>('[aria-current="page"]');
			if (!here) return;
			const top = here.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
			if (top < nav.scrollTop || top + here.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = top - nav.clientHeight / 3;
		});
	});

	let menuOpen = $state(false);
	$effect(() => {
		void slug;
		menuOpen = false;
	});
</script>

<div class="docs-app-colors mx-auto w-full max-w-[94rem] flex-1 px-4 sm:px-6 lg:px-8">
	<div class="lg:grid lg:grid-cols-[17rem_1fr] lg:gap-12 xl:gap-16">
		<!-- mobile: search plus the nav folded behind one button -->
		<div
			class="border-surface-200-800 bg-surface-50-950 sticky top-[calc(4rem+1px)] z-30 -mx-4 border-b px-4 py-3 sm:-mx-6 sm:px-6 lg:hidden"
		>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => (menuOpen = !menuOpen)}
					class="border-surface-200-800 text-muted rounded-container flex shrink-0 items-center gap-2 border px-3 py-2 text-sm"
					aria-expanded={menuOpen}
				>
					<Menu class="h-4 w-4" />
					<span class="max-w-[9rem] truncate">{active?.title ?? 'Menu'}</span>
					<ChevronDown class="text-faint h-3.5 w-3.5 transition-transform {menuOpen ? 'rotate-180' : ''}" />
				</button>
				<div class="min-w-0 flex-1"><SearchButton /></div>
			</div>
			{#if menuOpen}
				<nav class="docs-scroll mt-3 max-h-[70vh] overflow-y-auto pb-2">
					{@render navList()}
				</nav>
			{/if}
		</div>

		<aside class="hidden lg:block">
			<!-- the tree can pass a short laptop viewport, and a sticky element that overflows is cut
			     off, so it scrolls within itself -->
			<div class="sticky top-[calc(4rem+1px)] flex max-h-[calc(100vh-4rem-1px)] flex-col pt-8">
				<div class="pb-4"><SearchButton /></div>
				<nav bind:this={sideNav} class="docs-scroll -mx-2 flex-1 overflow-y-auto px-2 pb-10">
					{@render navList()}
				</nav>
			</div>
		</aside>

		<div class="min-w-0 py-8 md:py-10">
			{@render children()}
		</div>
	</div>
</div>

<Search />

<!--
	Recursive, so the depth of the tree lives in the docs folder and not here. A branch opens only
	when the reader is inside it: the sidebar is a map of the docs, not a list of every page.
-->
{#snippet navItems(topics: NavNode[], depth: number)}
	<ul class={depth === 0 ? 'space-y-px' : 'border-surface-200-800 my-1 ml-4 space-y-px border-l pl-2'}>
		{#each topics as topic (topic.slug)}
			{@const onPath = slug === topic.slug || (topic.children.length > 0 && slug.startsWith(`${topic.slug}/`))}
			{@const here = topic.slug === slug}
			<li>
				<a
					href={localizeHref(hrefFor(topic.slug))}
					aria-current={here ? 'page' : undefined}
					class="rounded-base flex items-center justify-between gap-2 px-3 py-1.5 text-[0.9375rem] leading-6 transition-colors {here
						? 'preset-tonal-primary text-primary-ink font-medium'
						: onPath
							? 'text-surface-900 hover:preset-tonal font-medium'
							: 'text-muted hover:preset-tonal hover:text-surface-900'}"
				>
					<span>{topic.title}</span>
					{#if topic.children.length}
						<ChevronRight class="h-3.5 w-3.5 shrink-0 opacity-50 transition-transform {onPath ? 'rotate-90' : ''}" />
					{/if}
				</a>
				{#if topic.children.length && onPath}
					{@render navItems(topic.children, depth + 1)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet navList()}
	<a
		href={localizeHref('/docs')}
		class="rounded-base mb-5 block px-3 py-1.5 text-[0.9375rem] font-medium {slug === ''
			? 'preset-tonal-primary text-primary-ink'
			: 'text-muted hover:preset-tonal hover:text-surface-900'}">{'Overview'}</a
	>
	<div class="space-y-7">
		{#each groups as group (group.section)}
			<div>
				<p class="text-surface-900 mb-2 px-3 text-sm font-semibold">{group.section}</p>
				{@render navItems(group.topics, 0)}
			</div>
		{/each}
	</div>
{/snippet}
