<script lang="ts">
	// The round initial that stands in for a person: session peers in the title bar, comment authors
	// in the review panel. Shared so the two cannot drift into looking like different products.
	import { tip } from '$lib/components/tooltip.svelte';
	import { colorFor } from './initialColor';
	type Props = {
		name: string;
		/** an assigned colour (a session peer has one); omitted, it is derived from the name */
		color?: string | null;
		class?: string;
	};
	let { name, color = null, class: extra = 'size-5 text-[10px]' }: Props = $props();
</script>

<!-- one drawing: a disc made of a box snaps to the pixel grid and the letter in it does not, which put the letter up to
     half a pixel off. The capital's middle goes on the disc's, where a line box would put the font's own middle -->
<span class="flex shrink-0 rounded-full {extra}" use:tip={name}>
	<svg class="size-full font-bold" role="img" aria-label={name}>
		<circle cx="50%" cy="50%" r="50%" fill={color ?? colorFor(name)} />
		<text x="50%" y="50%" text-anchor="middle" fill="white" style="translate: 0 0.5cap">{(name || '?').slice(0, 1).toUpperCase()}</text>
	</svg>
</span>
