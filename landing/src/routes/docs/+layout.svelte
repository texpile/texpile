<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import { page } from '$app/state';
	import { hrefFor, siblings, lookup, type NavNode } from '$lib/docs/nav';

	let { data, children } = $props();

	// params, not url.pathname: the localized routes (/zh-Hans/docs/visual-editing/math) reroute to the
	// same route, so this stays correct in every locale
	const slug = $derived(page.params.slug ?? '');
	const isIndex = $derived(slug === '');
	const pager = $derived(siblings(data.nav, slug));
	const active = $derived(lookup(data.nav, slug));
	const currentTitle = $derived(active?.title ?? 'Documentation');

	// the top level, split where the section label changes; pages are already in section order
	const groups = $derived.by(() => {
		const out: { section: string; topics: NavNode[] }[] = [];
		for (const topic of data.nav) {
			const last = out[out.length - 1];
			if (last && last.section === topic.section) last.topics.push(topic);
			else out.push({ section: topic.section ?? '', topics: [topic] });
		}
		return out;
	});
</script>

<div class="container mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 md:py-12 lg:px-8">
	<div class="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
		<!-- mobile: the same nav, folded into a disclosure so it costs one row instead of a screen -->
		<details class="border-surface-200 mb-8 rounded-lg border lg:hidden">
			<summary class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-medium">
				<span class="flex items-center gap-2">
					<BookOpen class="text-surface-400 h-4 w-4" />
					{currentTitle}
				</span>
				<ChevronDown class="text-surface-400 h-4 w-4 shrink-0" />
			</summary>
			<nav class="border-surface-200 border-t px-2 py-2">
				{@render navList()}
			</nav>
		</details>

		<aside class="hidden lg:block">
			<!-- the tree is tall enough with a branch expanded to pass a short laptop viewport, and a
			     sticky element that overflows is simply cut off, so it scrolls within itself -->
			<nav class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
				<a
					href="/docs"
					class="mb-5 flex items-center gap-2 px-3 text-xs font-semibold tracking-wide uppercase {isIndex
						? 'text-primary-600'
						: 'text-surface-500 hover:text-surface-900'}"
				>
					<BookOpen class="h-3.5 w-3.5" />
					{'Documentation'}
				</a>
				{@render navList()}
			</nav>
		</aside>

		<div class="min-w-0">
			{@render children()}

			{#if !isIndex}
				<nav class="border-surface-200 mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
					{#if pager.prev}
						<a
							href={hrefFor(pager.prev.slug)}
							class="border-surface-200 hover:border-primary-400 group rounded-lg border p-4 transition-colors"
						>
							<span class="text-surface-500 flex items-center gap-1 text-xs">
								<ChevronLeft class="h-3.5 w-3.5" />
								{'Previous'}
							</span>
							<span class="text-surface-900 group-hover:text-primary-600 mt-1 block font-medium">{pager.prev.title}</span>
						</a>
					{:else}
						<div class="hidden sm:block"></div>
					{/if}
					{#if pager.next}
						<a
							href={hrefFor(pager.next.slug)}
							class="border-surface-200 hover:border-primary-400 group rounded-lg border p-4 text-right transition-colors"
						>
							<span class="text-surface-500 flex items-center justify-end gap-1 text-xs">
								{'Next'}
								<ChevronRight class="h-3.5 w-3.5" />
							</span>
							<span class="text-surface-900 group-hover:text-primary-600 mt-1 block font-medium">{pager.next.title}</span>
						</a>
					{/if}
				</nav>
			{/if}
		</div>
	</div>
</div>

<!--
	Recursive, so the depth of the tree lives in the docs folder and not here. The install pages are three
	levels deep (installation > latex > windows); everything else is one or two.

	Grandchildren render only under the branch the reader is inside. Showing all of them at once put
	25 rows in a sidebar that has to stay under one screen, and a reader installing Typst has no use
	for the three LaTeX platform pages.
-->
{#snippet navItems(topics: NavNode[], depth: number)}
	<ul class={depth === 0 ? 'space-y-0.5' : 'border-surface-200 mt-0.5 mb-1 ml-3 space-y-0.5 border-l pl-3'}>
		{#each topics as topic (topic.slug)}
			{@const onPath = slug === topic.slug || slug.startsWith(`${topic.slug}/`)}
			<li>
				<a
					href={hrefFor(topic.slug)}
					class="rounded-base block px-3 text-sm transition-colors {depth === 0 ? 'py-1.5' : 'py-1'} {topic.slug === slug
						? 'bg-primary-50 text-primary-700 font-medium'
						: `${depth === 0 ? 'text-surface-600' : 'text-surface-500'} hover:bg-surface-100 hover:text-surface-900`}"
				>
					{topic.title}
				</a>
				{#if topic.children.length && (depth === 0 || onPath)}
					{@render navItems(topic.children, depth + 1)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet navList()}
	<div class="space-y-8">
		{#each groups as group (group.section)}
			<div>
				<p class="text-surface-500 mb-3 px-3 text-xs font-semibold tracking-wide uppercase">{group.section}</p>
				{@render navItems(group.topics, 0)}
			</div>
		{/each}
	</div>
{/snippet}
