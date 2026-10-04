<script lang="ts" module>
	import { box } from '$lib/runes/box.svelte';
	import type { PastedImage } from '../agentPanel.types';

	/** the image shown large, from a chip in the box or a message; null while none is */
	export const previewedImage = box<PastedImage | null>(null);
</script>

<script lang="ts">
	// A quick look at an image going with a message, or gone with one: as large as the window allows, its name and size
	// under it. A click anywhere, or Escape, puts it away. Mounted once, by the panel, and drawn at the top of the page: inside
	// the dock it would stay under whatever stands above the dock
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { imageUrl } from '../attach/pastedImages';

	const image = $derived(previewedImage.current);

	function close(): void {
		previewedImage.current = null;
	}
</script>

{#if image}
	<Portal>
		<!-- as wide as the picture, where every other dialog is as wide as it is allowed -->
		<Modal onClose={close} card="flex max-h-full w-auto! max-w-[min(90vw,64rem)] flex-col items-center gap-2 p-2">
			<button type="button" class="min-h-0 cursor-zoom-out" aria-label={m.modal_close_aria()} onclick={close}>
				<img src={imageUrl(image)} alt={image.name} class="rounded-base max-h-[80vh] max-w-full object-contain" />
			</button>
			<p class="text-muted text-xs">
				{image.name}{#if image.size}&nbsp;· {image.size.width}×{image.size.height}{/if}
			</p>
		</Modal>
	</Portal>
{/if}
