<script lang="ts">
	import type { Component } from 'svelte';
	import { tip } from './tooltip';

	// Texpile's: round and proud of the divider, as it acts on the figure where the flat lozenge acts on the frame
	type Props = { icon: Component<{ class?: string }>; onclick: () => void; title: string; class?: string; style?: string };
	const props: Props = $props();
	const Icon = $derived(props.icon);
</script>

<button
	class="bg-surface-700-300 hover:bg-surface-800-200 absolute z-30 flex size-6 cursor-pointer items-center justify-center rounded-full text-white opacity-80 shadow-md transition hover:opacity-100 focus-visible:opacity-100 dark:text-black {props.class ??
		''}"
	style={props.style}
	onmousedown={(e) => e.preventDefault()}
	onclick={props.onclick}
	use:tip={props.title}
	aria-label={props.title}
>
	<Icon class="size-3.5 shrink-0" />
</button>
