<script lang="ts">
	// The round chip that floats on a pane divider for a one-shot action - today only the forward
	// sync jump. Deliberately NOT the shape of the collapse toggle beside it: that one is flush with
	// the divider because it belongs to the frame, this one sits proud of it because it acts on the
	// document. Overleaf draws the same distinction, and it is what stops two controls 100px apart
	// on the same strip from being mistaken for each other.
	//
	// Positioning is the caller's: only the caller knows where its divider is.
	import type { Component } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = {
		// capitalised so it can be used as a tag: {@const} is not allowed directly inside an element
		icon: Component;
		onclick: () => void;
		title: string;
		ariaLabel: string;
		class?: string;
	};
	let { icon: Icon, onclick, title, ariaLabel, class: extra = '' }: Props = $props();
</script>

<!-- preventDefault keeps focus on the editor, whose CARET is what the jump reads -->
<button
	class="bg-surface-700-300 hover:bg-primary-500 absolute z-30 flex size-6 cursor-pointer items-center justify-center rounded-full text-white opacity-80 shadow-md transition hover:opacity-100 focus-visible:opacity-100 dark:text-black {extra}"
	onmousedown={(e) => e.preventDefault()}
	{onclick}
	use:tip={title}
	aria-label={ariaLabel}
>
	<Icon class="size-3.5 shrink-0" />
</button>
