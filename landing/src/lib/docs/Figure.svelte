<script lang="ts">
	import { assetUrl } from './assets';
	import type { FigureItem } from './blocks';

	// An image is never scaled up: a small crop shows at its own size, a full screenshot shrinks to
	// the column, and nothing grows past 36rem tall. `narrow` caps the frame for screenshots that
	// are big in pixels but small in content. A video is a muted loop and behaves like an animated
	// image.
	let { items, narrow }: { items: FigureItem[]; narrow: boolean } = $props();
</script>

<figure class="not-prose my-6 {items.length > 1 ? 'grid items-start gap-6 sm:grid-cols-2' : ''}">
	{#each items as item (item.src)}
		<div class="border-surface-200 mx-auto h-fit w-fit max-w-full overflow-hidden rounded-xl border shadow-lg {narrow ? 'max-w-xl' : ''}">
			{#if item.video}
				<video
					autoplay
					muted
					loop
					playsinline
					disablepictureinpicture
					aria-label={item.alt}
					class="block h-auto max-h-[36rem] w-auto max-w-full"
				>
					<source src={assetUrl(item.src)} type="video/{item.src.split('.').pop()}" />
				</video>
			{:else}
				<img
					src={assetUrl(item.src)}
					alt={item.alt}
					loading="lazy"
					draggable="false"
					class="block h-auto max-h-[36rem] w-auto max-w-full"
				/>
			{/if}
		</div>
	{/each}
	{#if items.length === 1 && items[0].caption}
		<figcaption class="text-surface-500 mt-2 text-center text-sm">{items[0].caption}</figcaption>
	{/if}
</figure>
