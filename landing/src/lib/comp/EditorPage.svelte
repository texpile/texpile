<script module lang="ts">
	export type Panel = { img: string; alt: string; heading: string; body?: string; points?: string[]; docs: string };
	export type Section = { heading: string; body: string; img: string; alt: string; docs: string };
	export type Row = { label: string; cells: string[] };
	export type Feature = { key: string; icon: Component<{ class?: string; strokeWidth?: number }>; title: string; body: string };
	import type { Component } from 'svelte';
	import type { Startup } from '$lib/startup';
</script>

<script lang="ts">
	// One editor page (/latex-editor, /typst-editor). Both target one search intent and share the
	// same shape: the home hero with the format's own shot, two panels for the two ways to write,
	// two panels for reviews (visual diff, comments), the live preview, collaboration with a
	// comparison table, the start-up chart, themes, the feature grid, and the download band with
	// the toolchain line. The route supplies every word and image; what is Texpile-wide (the
	// start-up numbers, the download band) lives here.
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import Hero from '$lib/comp/Hero.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { reveal } from '$lib/reveal';

	let {
		title,
		description,
		path,
		heading,
		lead,
		heroShot,
		heroAlt,
		ways,
		reviews,
		preview,
		collab,
		themes,
		alsoSub,
		features,
		startup,
		needsLine
	}: {
		title: string;
		description: string;
		/** the English route, such as `/latex-editor`; the locale variants are derived from it */
		path: string;
		heading: string;
		lead: string;
		heroShot: string;
		heroAlt: string;
		ways: { sub: string; visual: Panel; source: Panel };
		reviews: { diff: Panel; comments: Panel };
		preview: Section;
		collab: Section & { columns: string[]; rows: Row[] };
		themes: Section;
		alsoSub: string;
		features: Feature[];
		startup: Startup[];
		needsLine: string;
	} = $props();

	const SITE = 'https://texpile.com';
	// self-referencing per locale; the alternates in the head say which language each URL is
	const canonical = $derived(SITE + localizeHref(path));

	const slowest = $derived(Math.max(...startup.map((s) => s.ms)));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />

	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />

	<meta property="twitter:url" content={canonical} />
	<meta property="twitter:title" content={title} />
	<meta property="twitter:description" content={description} />

	<link rel="canonical" href={canonical} />
	<link rel="alternate" hreflang="en" href={SITE + path} />
	<link rel="alternate" hreflang="zh-Hans" href={`${SITE}/zh-Hans${path}`} />
	<link rel="alternate" hreflang="zh-Hant" href={`${SITE}/zh-Hant${path}`} />
	<link rel="alternate" hreflang="x-default" href={SITE + path} />
</svelte:head>

<Hero {heading} body={lead} shot={heroShot} shotAlt={heroAlt} />

<section id="editing" class="bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl" use:reveal>
			<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.ed_ways_heading()}</h2>
			<p class="text-surface-600 mt-4 text-lg leading-relaxed">{ways.sub}</p>
		</div>
		<div class="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
			{@render panel(ways.visual, 0)}
			{@render panel(ways.source, 90)}
		</div>
	</div>
</section>

<section id="reviews" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl" use:reveal>
			<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.ed_reviews_heading()}</h2>
			<p class="text-surface-600 mt-4 text-lg leading-relaxed">{m.ed_reviews_sub()}</p>
		</div>
		<div class="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
			{@render panel(reviews.diff, 0)}
			{@render panel(reviews.comments, 90)}
		</div>
	</div>
</section>

<section id="live-preview" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
			<div class="lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{preview.heading}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{preview.body}</p>
				<p class="mt-6">{@render docsLink(preview.docs)}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<!-- an animated WebP: plays wherever an image does, with no autoplay rules to satisfy -->
					<img src={preview.img} alt={preview.alt} loading="lazy" draggable="false" class="block w-full" />
				</div>
			</div>
		</div>
	</div>
</section>

<section id="collaboration" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
			<!-- media on the left here, so the sides alternate down the page; the heading stays first in the DOM -->
			<div class="lg:order-2 lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{collab.heading}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{collab.body}</p>
				<p class="mt-6">{@render docsLink(collab.docs)}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<img src={collab.img} alt={collab.alt} loading="lazy" draggable="false" class="block w-full" />
				</div>
			</div>
		</div>

		<div class="border-surface-200 mt-14 overflow-x-auto rounded-lg border" use:reveal>
			<table class="w-full min-w-2xl text-left text-sm">
				<thead class="bg-surface-50 text-surface-700">
					<tr>
						<th scope="col" class="px-4 py-3"></th>
						{#each collab.columns as col, i (col)}
							<th scope="col" class="px-4 py-3 font-semibold {i === 0 ? 'text-surface-900' : ''}">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody class="text-surface-700">
					{#each collab.rows as row (row.label)}
						<tr class="border-surface-200 border-t">
							<th scope="row" class="text-surface-900 px-4 py-3 align-top font-semibold">{row.label}</th>
							{#each row.cells as cell, i (i)}
								<td class="px-4 py-3 align-top {i === 0 ? 'text-surface-900' : ''}">{cell}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>

<section id="speed" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
			<div class="lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.ed_speed_heading()}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{m.ed_speed_body()}</p>
				<p class="text-surface-500 mt-6 text-sm">* {m.ed_speed_vscode_note()}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<!-- the chart sits in the same frame as the screenshots in the sections around it: one measure
					 across three editors, as a table with the bar inside the cell, so it also reads as a table -->
				<div class="border-surface-200 rounded-xl border bg-white p-6 shadow-2xl sm:p-10">
					<table class="w-full">
						<tbody>
							{#each startup as s (s.name)}
								<tr>
									<th scope="row" class="text-surface-900 w-44 py-4 pr-4 text-left font-medium whitespace-nowrap">
										{s.name}{#if s.note}*{/if}
									</th>
									<td class="py-4">
										<div class="bg-surface-100 h-4 overflow-hidden rounded-full">
											<div
												class="h-full rounded-full {s.own ? 'bg-primary-500' : 'bg-surface-400'}"
												style:width="{(s.ms / slowest) * 100}%"
											></div>
										</div>
									</td>
									<td class="text-surface-900 w-24 py-4 pl-4 text-right font-semibold tabular-nums">{m.ed_ms({ n: s.ms })}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</section>

<section id="themes" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
			<!-- media left, after the chart sat right -->
			<div class="lg:order-2 lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{themes.heading}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{themes.body}</p>
				<p class="mt-6">{@render docsLink(themes.docs)}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<img src={themes.img} alt={themes.alt} loading="lazy" draggable="false" class="block w-full" />
				</div>
			</div>
		</div>
	</div>
</section>

<section id="features" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl" use:reveal>
			<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.ed_features_heading()}</h2>
			<p class="text-surface-600 mt-4 text-lg leading-relaxed">{alsoSub}</p>
		</div>

		<div class="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f, i (f.key)}
				{@const Icon = f.icon}
				<div class="border-surface-200 border-t pt-5" use:reveal={(i % 3) * 70}>
					<h3 class="text-surface-900 flex items-center gap-2.5 text-base font-semibold">
						<Icon class="text-primary-500 h-4 w-4 shrink-0" strokeWidth={2} />
						{f.title}
					</h3>
					<p class="text-surface-600 mt-2 leading-relaxed">{f.body}</p>
				</div>
			{/each}
		</div>

		<p class="mt-14">{@render docsLink('/docs')}</p>
	</div>
</section>

<section id="download" class="bg-ink-900 py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex flex-col items-center gap-7 text-center" use:reveal>
			<h2 class="display text-[clamp(2.25rem,4vw,3.5rem)] text-white">{m.download_section_heading()}</h2>
			<p class="text-surface-300 max-w-xl text-lg">{m.download_section_body()}</p>
			<a
				href="/download"
				class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white"
			>
				<Download class="h-5 w-5" />
				{m.word_download()}
			</a>
			<p class="text-surface-400 max-w-xl text-sm">{needsLine}</p>
			<p class="text-surface-400 font-mono text-xs">{m.hero_tagline()}</p>
		</div>
	</div>
</section>

{#snippet panel(p: Panel, delay: number)}
	<div class="flex flex-col gap-5" use:reveal={delay}>
		<!-- whole screenshot, uncropped, as on the home page: a crop lands on the app's chrome -->
		<div class="border-surface-200 overflow-hidden rounded-xl border bg-white shadow-lg">
			<img src={p.img} alt={p.alt} loading="lazy" draggable="false" class="block h-auto w-full" />
		</div>
		<h3 class="text-surface-900 text-xl font-semibold">{p.heading}</h3>
		{#if p.body}
			<p class="text-surface-600 leading-relaxed">{p.body}</p>
		{/if}
		{#if p.points}
			<ul class="space-y-3">
				{#each p.points as point (point)}
					<li class="flex items-start gap-3">
						<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
						<span class="text-surface-700 leading-relaxed">{point}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="mt-auto pt-1">{@render docsLink(p.docs)}</div>
	</div>
{/snippet}

{#snippet docsLink(href: string)}
	<a {href} class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors">
		{m.docs_link_label()}
		<ArrowRight class="h-4 w-4" />
	</a>
{/snippet}
