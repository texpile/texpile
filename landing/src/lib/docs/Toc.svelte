<script lang="ts">
	// "On this page": the ## headings, with the one being read highlighted.
	import type { TocItem } from './blocks';

	let { items }: { items: TocItem[] } = $props();

	let current = $state('');

	$effect(() => {
		const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
		if (!els.length) return;
		// the last heading above a line a third of the way down the viewport is the one being read
		const update = () => {
			const line = window.innerHeight * 0.35;
			let id = els[0].id;
			for (const el of els) if (el.getBoundingClientRect().top <= line) id = el.id;
			current = id;
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		return () => window.removeEventListener('scroll', update);
	});
</script>

{#if items.length > 1}
	<nav aria-label="On this page">
		<p class="text-surface-900 mb-3 text-sm font-semibold">{'On this page'}</p>
		<ul class="border-surface-200-800 space-y-0.5 border-l text-sm">
			{#each items as item (item.id)}
				<li>
					<a
						href="#{item.id}"
						class="-ml-px block border-l py-1 pl-3 leading-snug transition-colors {current === item.id
							? 'border-primary-500 text-primary-ink'
							: 'text-muted hover:text-surface-900 border-transparent'}"
					>
						{item.text}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
