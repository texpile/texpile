<script lang="ts">
	// one template in the Typst Universe gallery: its preview picture, name, and what it is for
	import { untrack } from 'svelte';
	import { FileText } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { universeGallery, thumbnailKey } from './universeGallery.svelte';
	import type { UniverseTemplate } from '../templateBridge.types';
	import { m } from '$lib/paraglide/messages';

	let { template }: { template: UniverseTemplate } = $props();

	const picture = $derived(universeGallery.thumbnails.get(thumbnailKey(template)));

	// on screen means wanted; untracked, so a picture arriving does not re-ask for every card
	$effect(() => {
		const t = template;
		untrack(() => universeGallery.wantThumbnail(t));
	});
</script>

<button
	class="border-surface-200-800 hover:border-primary-500 hover:bg-surface-100-900 rounded-container flex flex-col overflow-hidden border text-left transition-colors"
	onclick={() => universeGallery.pick(template)}
	use:tip={template.description}
>
	<span class="bg-surface-100-900 border-surface-200-800 block aspect-[4/3] w-full overflow-hidden border-b">
		{#if picture}
			<img src={picture} alt="" class="h-full w-full object-cover object-top" />
		{:else}
			<span class="text-faint flex h-full items-center justify-center"><FileText class="size-8" /></span>
		{/if}
	</span>
	<span class="flex min-w-0 flex-col gap-0.5 p-2.5">
		<span class="truncate text-sm font-medium">{template.name} <span class="text-muted text-xs font-normal">{template.version}</span></span>
		<span class="text-muted line-clamp-2 text-xs">{template.description}</span>
		{#if template.authors.length}
			<span class="text-faint truncate text-xs">{m.gallery_by({ authors: template.authors.join(', ') })}</span>
		{/if}
	</span>
</button>
