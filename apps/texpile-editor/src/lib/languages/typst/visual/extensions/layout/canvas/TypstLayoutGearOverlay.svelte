<script lang="ts">
	import TypstLayoutGear from '../TypstLayoutGear.svelte';

	type TypstLayoutGearOverlayProps = {
		cells: number | null;
		onopen: (gear: DOMRect) => void;
		onadd: () => void;
		onremove: () => void;
	};

	const props: TypstLayoutGearOverlayProps = $props();
	let strip: HTMLDivElement | undefined = $state();
</script>

<!-- over the top right corner, clear of the buttons a picture in the corner cell shows there -->
<div class="typ-layout-gear-overlay" bind:this={strip}>
	<TypstLayoutGear
		gear={{ cells: props.cells }}
		onopen={() => strip && props.onopen(strip.getBoundingClientRect())}
		onadd={props.onadd}
		onremove={props.onremove}
	/>
</div>

<style>
	.typ-layout-gear-overlay {
		position: absolute;
		top: 0;
		right: 0;
		transform: translateY(-100%);
		user-select: none;
	}
</style>
