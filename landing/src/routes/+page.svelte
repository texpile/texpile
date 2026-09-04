<script lang="ts">
	import {
		Download,
		Check,
		ArrowRight,
		Terminal,
		GitCommitHorizontal,
		FolderTree,
		Command,
		Keyboard,
		TextCursorInput,
		SpellCheck,
		Plug,
		History
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import Hero from '$lib/comp/Hero.svelte';
	import { reveal } from '$lib/reveal';
	import livePreviewMp4 from '$lib/assets/showcase/live-preview.mp4';
	import collabShot from '$lib/assets/showcase/editor-collab.webp';
	import commentsShot from '$lib/assets/showcase/editor-comments.webp';
	// One document (showcase.tex/.typ/.md) captured in both modes, so the toggle reads as one file
	// in three languages rather than three unrelated screenshots.
	import latexVisualShot from '$lib/assets/showcase/editor-latex-visual.webp';
	import latexSourceShot from '$lib/assets/showcase/editor-latex-source.webp';
	import typstVisualShot from '$lib/assets/showcase/editor-typst-visual.webp';
	import typstSourceShot from '$lib/assets/showcase/editor-typst-source.webp';
	import mdVisualShot from '$lib/assets/showcase/editor-markdown-visual.webp';
	import mdSourceShot from '$lib/assets/showcase/editor-markdown-source.webp';
	import { m } from '$lib/paraglide/messages';

	const features = [
		{ icon: Terminal, title: m.feature_terminal_title(), body: m.feature_terminal_body() },
		{ icon: GitCommitHorizontal, title: m.feature_history_title(), body: m.feature_history_body() },
		{ icon: FolderTree, title: m.feature_multifile_title(), body: m.feature_multifile_body() },
		{ icon: Command, title: m.feature_palette_title(), body: m.feature_palette_body() },
		{ icon: Keyboard, title: m.feature_keymaps_title(), body: m.feature_keymaps_body() },
		{ icon: TextCursorInput, title: m.feature_multicursor_title(), body: m.feature_multicursor_body() },
		{ icon: SpellCheck, title: m.feature_spellcheck_title(), body: m.feature_spellcheck_body() },
		{ icon: Plug, title: m.feature_mcp_title(), body: m.feature_mcp_body() },
		{ icon: History, title: m.feature_tabs_title(), body: m.feature_tabs_body() }
	];

	/**
	 * The editing section switches BOTH panels by format, bullets included. The bullets cannot be
	 * shared: the LaTeX source list is all LaTeX syntax (\ref, \cite, \input, \newcommand), Typst's
	 * intellisense comes from tinymist instead of Texpile's own parser, and Markdown has neither a
	 * cross-reference picker nor merged table cells (its serializer flattens colspan). A toggle
	 * that swapped only the images would leave those claims sitting under the wrong tab.
	 *
	 * LaTeX reuses its existing reviewed strings; Typst and Markdown have their own.
	 */
	const FORMATS = [
		{
			key: 'latex',
			label: m.formats_latex_title(),
			visual: { img: latexVisualShot, alt: m.visual_editing_video_aria() },
			source: { img: latexSourceShot, alt: m.intellisense_shot_alt() },
			visualPoints: [m.editing_point_1(), m.editing_point_2(), m.editing_point_3(), m.editing_point_5()],
			sourcePoints: [m.intellisense_point_1(), m.intellisense_point_2(), m.intellisense_point_3(), m.intellisense_point_4()]
		},
		{
			key: 'typst',
			label: m.formats_typst_title(),
			visual: { img: typstVisualShot, alt: m.formats_typst_title() },
			source: { img: typstSourceShot, alt: m.formats_typst_title() },
			visualPoints: [m.typst_visual_1(), m.typst_visual_2(), m.typst_visual_3(), m.typst_visual_4()],
			sourcePoints: [m.typst_source_1(), m.typst_source_2(), m.typst_source_3(), m.typst_source_4()]
		},
		{
			key: 'markdown',
			label: m.formats_md_title(),
			visual: { img: mdVisualShot, alt: m.formats_md_title() },
			source: { img: mdSourceShot, alt: m.formats_md_title() },
			visualPoints: [m.md_visual_1(), m.md_visual_2(), m.md_visual_3(), m.md_visual_4()],
			sourcePoints: [m.md_source_1(), m.md_source_2(), m.md_source_3(), m.md_source_4()]
		}
	];

	let activeFormat = $state(0);
	const fmt = $derived(FORMATS[activeFormat]);

	/** the mobile swipe track; a plain grid from lg up, where scrollLeft is always 0 anyway */
	let panelTrack = $state<HTMLDivElement | null>(null);

	async function pickFormat(i: number) {
		activeFormat = i;
		// Rewind to the visual panel: after swiping to source, switching format would otherwise
		// leave you looking at the new format's source with its visual panel skipped past.
		//
		// After the DOM update, so the new panels exist before the track is rewound.
		//
		// Instant, not smooth: `scroll-snap-type: mandatory` interrupts a smooth scroll animation
		// and leaves the track where it started (measured: 'auto' lands at 0, 'smooth' stays put).
		// Instant is also the better behaviour - you tapped a format to see it, not to watch it
		// slide - and it sidesteps prefers-reduced-motion entirely.
		await tick();
		panelTrack?.scrollTo({ left: 0, behavior: 'auto' });
	}

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
	<meta property="og:url" content="https://texpile.com/" />
	<meta property="og:title" content={m.home_title()} />
	<meta property="og:description" content={m.home_social_description()} />

	<!-- Page-specific Twitter -->
	<meta property="twitter:url" content="https://texpile.com/" />
	<meta property="twitter:title" content={m.home_title()} />
	<meta property="twitter:description" content={m.home_social_description()} />

	<link rel="canonical" href="https://texpile.com/" />
	<link rel="alternate" hreflang="en" href="https://texpile.com/" />
	<link rel="alternate" hreflang="zh-Hans" href="https://texpile.com/zh-Hans/" />
	<link rel="alternate" hreflang="zh-Hant" href="https://texpile.com/zh-Hant/" />
	<link rel="alternate" hreflang="de" href="https://texpile.com/de/" />
	<link rel="alternate" hreflang="x-default" href="https://texpile.com/" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

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

<section id="editing" class="bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<!-- the h2 names the formats rather than counting the modes: with the formats strip gone, no
			 heading on the page contained "Typst" at all, and headings are the one place besides the
			 h1 where that registers. The old heading is the subhead directly beneath. -->
		<div use:reveal>
			<h2 class="display text-surface-950 max-w-3xl text-[clamp(2rem,3.4vw,3rem)]">{m.editing_heading()}</h2>
			<p class="text-surface-600 mt-4 text-lg leading-relaxed">{m.editing_sub()}</p>
		</div>

		<!-- Sticky under the navbar on small screens. The two panels stack there and each shows a
			 full-height screenshot, so by the time you reach the source panel a static toggle would be
			 a screen and a half above you: you would have to scroll back up to change format. It is a
			 sibling of the panels (not inside the heading row) because a sticky element only travels
			 within its own parent, and this parent spans the whole section. From lg it goes static and
			 sits inline under the heading, where everything is visible at once anyway. -->
		<div
			class="border-surface-200 sticky top-16 z-30 -mx-4 mt-6 border-b bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-b-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
		>
			<div class="border-surface-200 inline-flex items-center gap-1 rounded-lg border bg-white p-1">
				{#each FORMATS as f, i (f.key)}
					<button
						onclick={() => pickFormat(i)}
						aria-pressed={i === activeFormat}
						aria-label={m.editing_format_aria({ label: f.label })}
						class="rounded-base px-4 py-2 text-sm font-medium transition-colors {i === activeFormat
							? 'bg-primary-500 text-white'
							: 'text-surface-600 hover:text-surface-900'}"
					>
						{f.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- The two modes read as a pair. From lg they sit side by side; below that they become one
			 swipe track instead of stacking, because two uncropped screenshots stacked is roughly two
			 phone screens of scrolling to see a comparison that is meant to be taken in at a glance.
			 Native scroll-snap does the paging, so there is no carousel JS and no auto-advance: the
			 next panel peeks in at the edge to show it moves, and the user drives it. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- tabindex is required, not incidental: a scrollable region that cannot be focused cannot be
			 scrolled by keyboard at all, so removing it to silence the rule would remove the only way a
			 keyboard user reaches the source panel on a phone. -->
		<div
			bind:this={panelTrack}
			role="group"
			aria-label={m.editing_heading()}
			tabindex="0"
			class="track -mx-4 mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-14 lg:grid lg:grid-cols-2 lg:gap-16 lg:overflow-x-visible lg:px-0 lg:pb-0"
		>
			<div id="visual-editing" class="flex w-[86%] shrink-0 snap-center flex-col gap-5 sm:w-[65%] lg:w-auto" use:reveal>
				<!-- whole screenshot, uncropped: any fixed-height crop lands on the app's title bar,
					 tab bar and toolbars, which is chrome rather than the editing surface -->
				<div class="border-surface-200 overflow-hidden rounded-xl border bg-white shadow-lg">
					<img src={fmt.visual.img} alt={fmt.visual.alt} loading="lazy" draggable="false" class="block h-auto w-full" />
				</div>
				<h3 class="text-surface-900 text-xl font-semibold">{m.visual_editing_heading()}</h3>
				<!-- One line shown, but ALL THREE rendered and the inactive ones hidden with CSS.
					 Rendering only the active format left every Typst and Markdown claim out of the
					 static HTML, so the section built to prove Typst support was the one section a
					 crawler could not read. Not cloaking: the same click that a reader uses reveals it. -->
				{#each FORMATS as f (f.key)}
					<div class="flex items-start gap-3" class:hidden={f.key !== fmt.key}>
						<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
						<span class="text-surface-700 leading-relaxed">{f.visualPoints[0]}</span>
					</div>
				{/each}
				<div class="mt-auto pt-1">{@render docsLink('/docs/visual-editing')}</div>
			</div>

			<div id="source-editing" class="flex w-[86%] shrink-0 snap-center flex-col gap-5 sm:w-[65%] lg:w-auto" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border bg-white shadow-lg">
					<img src={fmt.source.img} alt={fmt.source.alt} loading="lazy" draggable="false" class="block h-auto w-full" />
				</div>
				<h3 class="text-surface-900 text-xl font-semibold">{m.source_editing_heading()}</h3>
				{#each FORMATS as f (f.key)}
					<div class="flex items-start gap-3" class:hidden={f.key !== fmt.key}>
						<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
						<span class="text-surface-700 leading-relaxed">{f.sourcePoints[0]}</span>
					</div>
				{/each}
				<div class="mt-auto pt-1">{@render docsLink('/docs/latex/intellisense')}</div>
			</div>
		</div>
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
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<!-- muted looping demo, behaves like an animated image -->
					<video autoplay muted loop playsinline disablepictureinpicture aria-label={m.live_preview_video_aria()} class="block w-full">
						<source src={livePreviewMp4} type="video/mp4" />
					</video>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- The formats strip that used to sit here is gone: the editing section's toggle now shows all
	 three. Their toolchain requirements (TeX distribution / tinymist / none) are no longer stated
	 anywhere on this page - they live in /docs/installation, which the nav links to. -->
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

<!-- Comments sit next to collaboration but not inside it: they are not real-time editing, they
	 work perfectly well alone, and folding them in would make that section argue two things. -->
<section id="comments" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-end gap-8 lg:grid-cols-12 lg:gap-12">
			<!-- text first in the DOM as well as on screen: a heading should precede its image for
				 anyone reading linearly, and media-right alternates against collaboration above. -->
			<div class="lg:col-span-4" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.comments_heading()}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{m.comments_body()}</p>
				<p class="mt-6">{@render docsLink('/docs/comments')}</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<img src={commentsShot} alt={m.comments_shot_alt()} loading="lazy" draggable="false" class="block w-full" />
				</div>
			</div>
		</div>
	</div>
</section>

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

		<p class="text-surface-600 mt-14">
			{m.features_docs_note()}
			<span class="ml-2 inline-block">{@render docsLink('/docs')}</span>
		</p>
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
				href="/download"
				class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white"
			>
				<Download class="h-5 w-5" />
				{m.word_download()}
			</a>
			<p class="text-surface-400 font-mono text-xs">{m.hero_tagline()}</p>
		</div>
	</div>
</section>

<section id="ps" class="bg-ink-900 border-t border-white/10 py-12">
	<div class="container mx-auto max-w-2xl px-4 text-center sm:px-6">
		<h2 class="text-surface-300 text-base font-semibold">{m.ps_heading()}</h2>
		<p class="text-surface-500 mt-3 text-sm leading-relaxed">
			{m.ps_body()}
		</p>
	</div>
</section>

{#snippet docsLink(href: string, ink = false)}
	<!-- primary-600 is a dark blue: readable on paper, near-invisible on an ink band -->
	<a
		{href}
		class="inline-flex items-center gap-1.5 font-medium transition-colors {ink
			? 'text-secondary-400 hover:text-secondary-300'
			: 'text-primary-600 hover:text-primary-700'}"
	>
		{m.docs_link_label()}
		<ArrowRight class="h-4 w-4" />
	</a>
{/snippet}

<style>
	/* The swipe track's own scrollbar would sit under the panels as a grey bar on every phone.
	   Hidden, not disabled: the track still scrolls by touch, trackpad, and keyboard. */
	.track {
		scrollbar-width: none;
	}

	.track::-webkit-scrollbar {
		display: none;
	}

	/* focus ring for the keyboard path, since the track is a focusable scroll region */
	.track:focus-visible {
		outline: 2px solid var(--color-primary-500);
		outline-offset: 4px;
	}
</style>
