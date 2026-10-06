<script module lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	export type Integration = { title: string; body: string; img: string; alt: string; docs: string };
</script>

<script lang="ts">
	// the integrations section: a card per tool, each with the dialog it opens; shared by the home and editor pages
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { m } from '$lib/paraglide/messages';
	import { reveal } from '$lib/reveal';

	type IntegrationGridProps = { items: Integration[] };
	const props: IntegrationGridProps = $props();
	const { items } = $derived(props);
</script>

<section id="integrations" class="border-surface-200 border-t bg-white py-20 md:py-28">
	<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<h2 class="display text-surface-950 max-w-3xl text-[clamp(2rem,3.4vw,3rem)]" use:reveal>{m.integrations_heading()}</h2>
		<div class="mt-14 grid gap-10 md:grid-cols-2 {items.length === 3 ? 'lg:grid-cols-3' : ''}">
			{#each items as it, i (it.title)}
				<div class="flex flex-col gap-5" use:reveal={(i % 3) * 70}>
					<!-- the dialogs are different shapes; a dark stage of one height lines the row up -->
					<div class="bg-ink-900 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl p-5">
						<img src={it.img} alt={it.alt} loading="lazy" draggable="false" class="max-h-full max-w-full rounded-lg shadow-2xl" />
					</div>
					<div>
						<h3 class="text-surface-900 text-base font-semibold">{it.title}</h3>
						<p class="text-surface-600 mt-2 leading-relaxed">{it.body}</p>
						<p class="mt-3">
							<a
								href={localizeHref(it.docs)}
								class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
							>
								{m.docs_link_label()}
								<ArrowRight class="h-4 w-4" />
							</a>
						</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
