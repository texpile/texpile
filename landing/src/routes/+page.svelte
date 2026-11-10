<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import Download from '@lucide/svelte/icons/download';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Hero from '$lib/comp/Hero.svelte';
	import SceneLoop from '$lib/comp/hero/SceneLoop.svelte';
	import AiSection from '$lib/comp/AiSection.svelte';
	import { PREVIEW_LOOP } from '$lib/comp/hero/heroScenes';
	import { featureList } from '$lib/features';
	import { reveal } from '$lib/reveal';
	import EditorStage from '$lib/comp/EditorStage.svelte';
	import collabShot from '$lib/assets/showcase/collab.webp';
	import { m } from '$lib/paraglide/messages';
	import Alternates, { absolute } from '$lib/comp/Alternates.svelte';

	const features = featureList();
	// self-referencing per locale; the alternates in the head say which language each URL is
	const canonical = absolute('/');

	const jsonLdFeatureList = [
		m.home_jsonld_feature_1(),
		m.home_jsonld_feature_2(),
		m.home_jsonld_feature_3(),
		m.home_jsonld_feature_4(),
		m.home_jsonld_feature_5(),
		m.home_jsonld_feature_6()
	];

	// escape for embedding in a <script type="application/ld+json"> block below.
	//
	// No `offers` and no `aggregateRating`, deliberately. Google's software app rich result requires
	// name + offers.price + one of aggregateRating/review, and we have no review data to give it, so
	// the rich result is out of reach whatever we put here. An offers block without a price is
	// invalid and ignored; inventing a rating to satisfy the third requirement is a manual-action
	// risk. What is left is still valid schema.org and still feeds entity understanding - Google
	// states outright that structured data it does not use for a rich result does no harm.
	const jsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'Texpile',
		description: m.home_meta_description(),
		url: 'https://texpile.com',
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Windows, macOS, Linux',
		creator: {
			'@type': 'Organization',
			name: 'Texpile'
		},
		featureList: jsonLdFeatureList
	}).replace(/</g, '\\u003c');
</script>

<svelte:head>
	<title>{m.home_title()}</title>
	<meta name="description" content={m.home_meta_description()} />

	<!-- Page-specific Open Graph -->
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={m.home_title()} />
	<meta property="og:description" content={m.home_social_description()} />

	<!-- Page-specific Twitter -->
	<meta property="twitter:url" content={canonical} />
	<meta property="twitter:title" content={m.home_title()} />
	<meta property="twitter:description" content={m.home_social_description()} />

	<link rel="canonical" href={canonical} />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>
<Alternates path="/" />

<!--
	Section tone, one rule: INK only where nothing has to stand out against it.

	Every product screenshot on this site is a dark editor window - measured average luma 74-81,
	with 1-5% of pixels above mid-grey. On ink they lose their edges; on white they read as screens.
	The single exception is the hero shot, at luma 125 and 29% light pixels, because it contains a
	white typeset PDF page: that one is lit BY the dark band rather than lost in it.

	  ink    hero (the one light-carrying shot) and the download / PS / footer run, which has no
	         imagery competing with it at all.
	  paper  every section built around a dark screenshot: editing, live preview, collaboration,
	         comments, plus features.

	Consecutive paper sections are separated by a hairline border, not a second background tone:
	surface-50 is rgb(250,250,250), a 1.04:1 step against white, so alternating them was invisible
	and the border was doing the work anyway. Ink against white is 17.33:1, the only tone change on
	the page a reader actually registers - so it is spent on the two ends and nowhere else.
-->
<Hero />

<!-- The width follows the viewport height so the heading, the still, and its captions fit one screen. -->
<section id="editing" class="bg-white py-12 md:py-16">
	<div class="mx-auto px-4 sm:px-6 lg:px-8" style="max-width: min(80rem, max(44rem, calc((100svh - 27rem) * 1280 / 760 + 4rem)))">
		<div use:reveal>
			<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.editing_heading()}</h2>
		</div>

		<EditorStage />
	</div>
</section>

<!-- Live preview: the strongest asset on the page, so it gets the widest frame and the text
	 steps aside into a narrow column rather than sitting centered above it. -->
<section id="live-preview" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-end gap-8 lg:grid-cols-12 lg:gap-12">
			<div class="lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.live_preview_heading()}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{m.live_preview_body()}</p>
				<p class="mt-6">{@render docsLink('/docs/latex/live-preview')}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<SceneLoop video={PREVIEW_LOOP.video} poster={PREVIEW_LOOP.poster} alt={m.live_preview_video_aria()} />
			</div>
		</div>
	</div>
</section>

<section id="collaboration" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<!-- same 4/8 split, items-end and spacing as live preview: these three sections read as one
			 family, so only the side the media sits on changes between them. -->
		<div class="grid items-end gap-8 lg:grid-cols-12 lg:gap-12">
			<!-- media on the LEFT here, between two media-right sections, so the asymmetry alternates
				 down the page. Heading stays first in the DOM and only the visual order flips, so the
				 reading order is still text-then-image. -->
			<div class="lg:order-2 lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.collab_heading()}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{m.collab_body()}</p>
				<p class="mt-6">{@render docsLink('/docs/collaboration')}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<img src={collabShot} alt={m.collab_heading()} loading="lazy" draggable="false" class="block w-full" />
				</div>
			</div>
		</div>
	</div>
</section>

<!-- The home page keeps only what someone would pick the app for. Comments, version history and
	 the integrations are on the format pages and in the features grid. -->
<AiSection alternate={false} />

<section id="features" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<h2 class="display text-surface-950 max-w-3xl text-[clamp(2rem,3.4vw,3rem)]" use:reveal>{m.features_heading()}</h2>

		<div class="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f, i (f.title)}
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

<!-- Closing ink band. It runs straight into the footer on purpose, so the page ends on the
	 same surface it opened on. -->
<section id="download" class="bg-ink-900 py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex flex-col items-center gap-7 text-center" use:reveal>
			<h2 class="display text-[clamp(2.25rem,4vw,3.5rem)] text-white">{m.download_section_heading()}</h2>
			<p class="text-surface-300 max-w-xl text-lg">{m.download_section_body()}</p>
			<a
				href={localizeHref('/download')}
				class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white"
			>
				<Download class="h-5 w-5" />
				{m.word_download()}
			</a>
			<div id="ps" class="max-w-2xl">
				<h3 class="text-surface-300 text-base font-semibold">{m.ps_heading()}</h3>
				<p class="text-surface-500 mt-3 text-sm leading-relaxed">{m.ps_body()}</p>
			</div>
		</div>
	</div>
</section>

{#snippet docsLink(href: string, ink = false)}
	<!-- primary-600 is a dark blue: readable on paper, near-invisible on an ink band -->
	<a
		href={localizeHref(href)}
		class="inline-flex items-center gap-1.5 font-medium transition-colors {ink
			? 'text-secondary-400 hover:text-secondary-300'
			: 'text-primary-600 hover:text-primary-700'}"
	>
		{m.docs_link_label()}
		<ArrowRight class="h-4 w-4" />
	</a>
{/snippet}
