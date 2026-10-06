<script lang="ts">
	// AI integration: the Agent tab at work on the paper, its edit waiting as a suggestion; shared by the home and editor pages
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import latexShot from '$lib/assets/showcase/agent.webp';
	import typstShot from '$lib/assets/showcase/agent-typst.webp';
	import { m } from '$lib/paraglide/messages';
	import { reveal } from '$lib/reveal';

	type AiSectionProps = { format?: 'latex' | 'typst'; alternate?: boolean };
	const props: AiSectionProps = $props();
	const { format = 'latex', alternate = true } = $derived(props);
</script>

<section id="ai" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid items-end gap-8 lg:grid-cols-12 lg:gap-12">
			<!-- `alternate` puts the picture on the left, so the sides keep alternating down the page -->
			<div class="lg:col-span-4 {alternate ? 'lg:order-2' : ''}" use:reveal>
				<h2 class="display text-surface-950 text-[clamp(2rem,3.4vw,3rem)]">{m.ai_heading()}</h2>
				<p class="text-surface-600 mt-5 leading-relaxed">{m.ai_body()}</p>
				<p class="mt-6">
					<a
						href={localizeHref('/docs/ai-assistant')}
						class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
					>
						{m.docs_link_label()}
						<ArrowRight class="h-4 w-4" />
					</a>
				</p>
			</div>
			<div class="lg:col-span-8" use:reveal={90}>
				<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
					<img
						src={format === 'typst' ? typstShot : latexShot}
						alt={m.ai_shot_alt()}
						loading="lazy"
						draggable="false"
						class="block w-full"
					/>
				</div>
			</div>
		</div>
	</div>
</section>
