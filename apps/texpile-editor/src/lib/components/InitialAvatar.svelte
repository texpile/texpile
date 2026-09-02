<script lang="ts" module>
	/**
	 * A stable colour for a name, when nobody assigned one.
	 *
	 * A live session hands out peer colours; a comment log does not - it is read on another machine,
	 * months later, by someone who was never in a session. Deriving the hue from the name means the
	 * same author is the same colour everywhere, for everyone, with nothing stored.
	 *
	 * Saturation and lightness are fixed, not hashed: they are what keeps white text legible on top,
	 * and a hashed lightness would eventually pick a colour that makes the initial disappear.
	 */
	export function colorFor(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
		return `hsl(${Math.abs(hash) % 360}deg 55% 42%)`;
	}
</script>

<script lang="ts">
	// The round initial that stands in for a person: session peers in the title bar, comment authors
	// in the review panel. Shared so the two cannot drift into looking like different products.
	import { tip } from '$lib/components/tooltip.svelte';
	type Props = {
		name: string;
		/** an assigned colour (a session peer has one); omitted, it is derived from the name */
		color?: string | null;
		class?: string;
	};
	let { name, color = null, class: extra = 'size-5 text-[10px]' }: Props = $props();
</script>

<span
	class="flex shrink-0 items-center justify-center rounded-full font-bold text-white {extra}"
	style="background-color: {color ?? colorFor(name)}"
	use:tip={name}
>
	{(name || '?').slice(0, 1).toUpperCase()}
</span>
