<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import OsLogo from '$lib/comp/OsLogo.svelte';
	import Blocks from '$lib/docs/Blocks.svelte';
	import DocsHead from '$lib/docs/DocsHead.svelte';
	import { ICONS } from '$lib/docs/icons';
	import { hrefFor, navGroups, siblings } from '$lib/docs/nav';
	import SearchButton from '$lib/docs/SearchButton.svelte';
	import Toc from '$lib/docs/Toc.svelte';

	let { data } = $props();

	const isIndex = $derived(data.slug === '');
	const pager = $derived(siblings(data.nav, data.slug));

	// the index: the first section is "start here", every other section is one card
	const groups = $derived(navGroups(data.nav, ''));

	// a section of several pages has no page of its own to take a blurb from
	const SECTION_BLURBS: Record<string, string> = {
		'Editor tips': 'Selecting whole blocks, pasting from Word or Excel, dropping in files, and spell check.',
		Workflow: 'Projects and files, the PDF and the toolchain, and Git.',
		'Review and collaboration': 'Comments, suggestions, and editing together live.',
		'AI and integrations': 'AI agents, MCP, Zotero, and citing by DOI.',
		Customize: 'Preferences, themes, and keyboard shortcuts.'
	};
	const cards = $derived(
		groups.slice(1).map((g) => {
			const pages = data.nav.filter((n) => n.section === g.section);
			const chapter = pages.length === 1 ? pages[0] : null;
			const links = (chapter ? chapter.children : pages.slice(1)).slice(0, 1);
			return {
				section: g.section,
				icon: (chapter ?? pages[0]).icon,
				blurb: SECTION_BLURBS[g.section] ?? (chapter ?? pages[0]).blurb,
				slug: chapter && chapter.overview !== 'none' ? chapter.slug : (chapter ? chapter.children[0] : pages[0]).slug,
				label: chapter && chapter.overview !== 'none' ? 'Overview' : (chapter ? chapter.children[0] : pages[0]).title,
				links: chapter && chapter.overview === 'none' ? chapter.children.slice(1, 2) : links
			};
		})
	);
</script>

<DocsHead title={data.headTitle} description={data.description} path={data.path} />

{#snippet icon(name: string | undefined, cls: string)}
	{#if name === 'windows' || name === 'apple' || name === 'linux'}
		<OsLogo os={name} class={cls} />
	{:else if name && ICONS[name]}
		{@const Icon = ICONS[name]}
		<Icon class={cls} />
	{/if}
{/snippet}

{#if isIndex}
	<div class="max-w-6xl">
		<header class="max-w-2xl">
			<h1 class="text-surface-900 text-4xl font-semibold tracking-tight md:text-5xl">{data.title}</h1>
			{#if data.lead}
				<p class="doc-links text-muted mt-4 text-lg leading-relaxed">{@html data.lead}</p>
			{/if}
			<div class="mt-8 max-w-xl"><SearchButton size="lg" /></div>
			<p class="text-muted mt-4 flex items-center gap-2 text-[0.9375rem]">
				{@render icon('life-buoy', 'h-4 w-4 text-primary-ink')}
				Something not working?
				<a href={localizeHref(hrefFor('troubleshooting'))} class="text-primary-ink font-medium hover:underline">Troubleshooting</a>
			</p>
		</header>

		{#if groups[0]}
			<section class="mt-14">
				<h2 class="text-surface-900 text-base font-semibold">{'Start here'}</h2>
				<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each groups[0].topics as topic (topic.slug)}
						<a
							href={localizeHref(hrefFor(topic.slug))}
							class="border-surface-200-800 hover:border-primary-500 group rounded-container bg-surface-50-950 border p-4 transition-all hover:shadow-sm"
						>
							<span class="preset-tonal-primary text-primary-ink rounded-container flex h-8 w-8 items-center justify-center">
								{@render icon(topic.icon, 'h-4 w-4')}
							</span>
							<span class="text-surface-900 group-hover:text-primary-ink mt-3 block text-base font-semibold">{topic.title}</span>
							<span class="text-muted mt-1 block text-sm leading-relaxed">{topic.blurb}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section class="mt-16">
			<h2 class="text-surface-900 text-2xl font-semibold tracking-tight">Browse by topic</h2>
			<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each cards as card (card.section)}
					<div class="border-surface-200-800 rounded-container bg-surface-50-950 flex flex-col border p-5">
						<span class="preset-tonal-primary text-primary-ink rounded-container flex h-9 w-9 items-center justify-center">
							{@render icon(card.icon, 'h-[18px] w-[18px]')}
						</span>
						<h3 class="text-surface-900 mt-4 text-lg font-semibold">{card.section}</h3>
						<p class="text-muted mt-1 mb-5 text-[0.9375rem] leading-relaxed">{card.blurb}</p>
						<div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
							<a
								href={localizeHref(hrefFor(card.slug))}
								class="bg-surface-100-900 hover:preset-tonal text-surface-900 rounded-container inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
								>{card.label} <ArrowRight class="h-3.5 w-3.5" /></a
							>
							{#each card.links as link (link.slug)}
								<a
									href={localizeHref(hrefFor(link.slug))}
									class="text-muted hover:text-primary-ink inline-flex items-center gap-1 text-sm font-medium"
									>{link.title} <ArrowRight class="h-3.5 w-3.5" /></a
								>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>
{:else}
	<div class="xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-16">
		<article class="max-w-[54rem] min-w-0">
			{#if data.formats.length}
				<div class="bg-surface-100-900 rounded-container mb-6 inline-flex p-1 text-sm" role="group" aria-label="Format">
					{#each data.formats as f (f.href)}
						<a
							href={localizeHref(f.href)}
							aria-current={f.current ? 'page' : undefined}
							class="rounded-base px-3.5 py-1.5 font-medium transition-colors {f.current
								? 'text-surface-900 bg-surface-50-950 shadow-sm'
								: 'text-muted hover:text-surface-900'}">{f.label}</a
						>
					{/each}
				</div>
			{/if}
			{#if data.trail.length || data.sectionHref || data.section !== data.title}
				<nav aria-label="Breadcrumb" class="text-muted mb-3 flex flex-wrap items-center gap-1 text-sm">
					{#if data.sectionHref}
						<a href={localizeHref(data.sectionHref)} class="text-primary-ink font-medium hover:underline">{data.section}</a>
					{:else}
						<span class="text-primary-ink font-medium">{data.section}</span>
					{/if}
					{#each data.trail as crumb (crumb.href)}
						<ChevronRight class="text-surface-300 h-3.5 w-3.5" />
						<a href={localizeHref(crumb.href)} class="hover:text-surface-900">{crumb.title}</a>
					{/each}
				</nav>
			{/if}
			<header>
				<h1 class="text-surface-900 text-[2rem] leading-tight font-semibold tracking-tight md:text-[2.5rem]">{data.title}</h1>
				{#if data.lead}
					<p class="doc-links text-muted mt-4 text-[1.1875rem] leading-relaxed">{@html data.lead}</p>
				{/if}
			</header>

			<div class="doc prose mt-8 max-w-none">
				<Blocks blocks={data.blocks} />
			</div>

			<nav class="border-surface-200-800 mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2">
				{#if pager.prev}
					<a
						href={localizeHref(hrefFor(pager.prev.slug))}
						class="border-surface-200-800 hover:border-primary-500 group rounded-container border px-4 py-3 transition-colors"
					>
						<span class="text-muted flex items-center gap-1.5 text-xs"><ArrowLeft class="h-3.5 w-3.5" />{'Previous'}</span>
						<span class="text-surface-900 group-hover:text-primary-ink mt-1 block text-sm font-medium">{pager.prev.title}</span>
					</a>
				{:else}
					<div class="hidden sm:block"></div>
				{/if}
				{#if pager.next}
					<a
						href={localizeHref(hrefFor(pager.next.slug))}
						class="border-surface-200-800 hover:border-primary-500 group rounded-container border px-4 py-3 text-right transition-colors"
					>
						<span class="text-muted flex items-center justify-end gap-1.5 text-xs">{'Next'}<ArrowRight class="h-3.5 w-3.5" /></span>
						<span class="text-surface-900 group-hover:text-primary-ink mt-1 block text-sm font-medium">{pager.next.title}</span>
					</a>
				{/if}
			</nav>
		</article>

		<aside class="hidden xl:block">
			<div class="docs-scroll sticky top-[calc(4rem+1px+2rem)] max-h-[calc(100vh-7rem)] overflow-y-auto">
				<Toc items={data.toc} />
			</div>
		</aside>
	</div>
{/if}
