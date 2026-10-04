<script lang="ts">
	// An image that goes with a message, as the file's pill shows a file: a small picture, its name and its size in
	// pixels. A click shows it large; in the box an x takes it off
	import { X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { imageUrl } from '../attach/pastedImages';
	import { previewedImage } from './AgentImagePreview.svelte';
	import type { PastedImage } from '../agentPanel.types';

	type Props = { image: PastedImage; onDetach: () => void };
	const props: Props = $props();
</script>

<span
	class="border-surface-300-700 text-surface-700-300 rounded-base inline-flex h-6 max-w-56 min-w-0 shrink items-center gap-1 border pr-0.5 pl-1 text-xs"
>
	<button
		type="button"
		class="flex min-w-0 cursor-zoom-in items-center gap-1"
		use:tip={m.agent_panel_image_preview()}
		onclick={() => (previewedImage.current = props.image)}
	>
		<img src={imageUrl(props.image)} alt={m.agent_panel_image()} class="size-4 shrink-0 rounded-sm object-cover" />
		<span class="truncate">{props.image.name}</span>
		{#if props.image.size}<span class="text-muted shrink-0">{props.image.size.width}×{props.image.size.height}</span>{/if}
	</button>
	<button
		class="text-muted hover:bg-surface-200-800 rounded-base flex size-4.5 shrink-0 items-center justify-center transition-colors"
		aria-label={m.agent_panel_detach()}
		use:tip={m.agent_panel_detach()}
		onclick={props.onDetach}
	>
		<X class="size-3" />
	</button>
</span>
