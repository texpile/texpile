<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';
	import Download from '@lucide/svelte/icons/download';
	import Github from '@lucide/svelte/icons/github';
	import HeroScreencast from './hero/HeroScreencast.svelte';
	import type { HeroFormat } from './hero/heroScenes';
	import { detectOS, type OS } from '$lib/os';
	import { m } from '$lib/paraglide/messages';

	// the home page's words and both formats by default; an editor page passes its own words and its format
	let { heading = m.hero_heading(), body = m.hero_body(), format }: { heading?: string; body?: string; format?: HeroFormat } = $props();

	const OS_NAME: Record<OS, string> = {
		windows: m.word_windows(),
		mac: m.word_macos(),
		linux: m.word_linux()
	};

	// the site is prerendered, so the generic label ships in the HTML and narrows once the UA is readable
	let os = $state<OS | null>(null);
	const downloadLabel = $derived(os ? m.dl_download_for({ name: OS_NAME[os] }) : m.word_download());

	onMount(() => {
		os = detectOS();
	});
</script>

<!-- The one dark band at the top of the page. A white editor screenshot on ink is the highest
	 contrast composition available here, and it is also just what the app looks like. -->
<section id="top" class="bg-ink-900 overflow-hidden">
	<div class="container mx-auto px-4 pt-20 pb-14 sm:px-6 md:pt-28 lg:px-8">
		<!-- 6xl, not 5xl: "LaTeX and Typst" spelled out needs the wider measure to stay on two lines
			 in English and German. A third line pushes the CTA and the product shot out of the fold. -->
		<div class="mx-auto max-w-6xl space-y-8 text-center">
			<!-- No accent colour in the headline on purpose: the download button is then the only
				 saturated thing in the fold, so it wins the eye instead of competing with 77px of cyan. -->
			<h1 class="display text-[clamp(2.5rem,6vw,5.25rem)] text-balance text-white">{heading}</h1>

			<p class="text-surface-400 mx-auto max-w-xl text-sm leading-relaxed text-pretty sm:text-base">
				{body}
			</p>

			<div class="flex flex-wrap items-center justify-center gap-3">
				<a
					href={localizeHref('/download')}
					class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-7 py-3 font-semibold text-white"
				>
					<Download class="h-5 w-5" />
					{downloadLabel}
				</a>
				<a
					href="https://github.com/texpile/texpile"
					target="_blank"
					rel="noopener noreferrer"
					class="rounded-base inline-flex items-center gap-2 border border-white/15 px-7 py-3 font-semibold text-white transition-colors hover:bg-white/10"
				>
					<Github class="h-5 w-5" />
					{m.hero_cta_github()}
				</a>
			</div>
		</div>
	</div>

	<div class="pb-20 md:pb-28">
		<HeroScreencast formats={format ? [format] : ['latex', 'typst']} />
	</div>
</section>
