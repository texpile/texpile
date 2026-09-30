<script lang="ts">
	// Draws what it wraps as the chosen color vision sees it. A filter over the rendered view and
	// nothing else: the document, its source and every export keep their own colors.
	//
	// The filter is defined right beside the element it filters because url(#id) resolves in that
	// element's own document, and the preview can be popped out into a window of its own.
	import type { Snippet } from 'svelte';
	import ColorVisionBadge from './ColorVisionBadge.svelte';
	import { colorVision, feColorMatrixValues } from './colorVision';

	type Props = {
		/** layout for both the frame and the filtered box inside it, so the wrapper takes the place of what it wraps */
		class?: string;
		children: Snippet;
	};
	let { class: layout = '', children }: Props = $props();

	const id = $props.id();
	const values = $derived(feColorMatrixValues(colorVision.current));
</script>

<div class="relative {layout}">
	<div class={layout} style:filter={values ? `url(#${id})` : undefined} data-color-vision={colorVision.current}>
		{@render children()}
	</div>
	{#if values}
		<svg class="pointer-events-none absolute size-0" aria-hidden="true">
			<filter {id} color-interpolation-filters="linearRGB">
				<feColorMatrix type="matrix" {values} />
			</filter>
		</svg>
		<ColorVisionBadge />
	{/if}
</div>
