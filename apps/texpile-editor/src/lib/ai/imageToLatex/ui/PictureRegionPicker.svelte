<script lang="ts">
	// the picture, with the part to convert dragged out over it
	import { regionBetween, type PictureRegion } from '../pictureBytes';

	type Props = {
		url: string;
		size: { w: number; h: number };
		region: PictureRegion | null;
		onpick: (region: PictureRegion | null) => void;
	};
	const props: Props = $props();

	let shownWidth = $state(0);
	let shownHeight = $state(0);
	let from = $state<{ x: number; y: number } | null>(null);
	let drag = $state<PictureRegion | null>(null);

	const k = $derived(shownWidth ? shownWidth / props.size.w : 1);
	const shownRegion = $derived(drag ?? props.region);

	function pointOf(e: PointerEvent): { x: number; y: number } {
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return { x: e.clientX - box.left, y: e.clientY - box.top };
	}

	function down(e: PointerEvent): void {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		from = pointOf(e);
		drag = null;
	}

	function move(e: PointerEvent): void {
		if (from) drag = regionBetween(from, pointOf(e), { w: shownWidth, h: shownHeight }, props.size);
	}

	function up(e: PointerEvent): void {
		if (!from) return;
		const picked = regionBetween(from, pointOf(e), { w: shownWidth, h: shownHeight }, props.size);
		from = null;
		drag = null;
		props.onpick(picked);
	}
</script>

<div
	class="relative inline-block cursor-crosshair touch-none select-none"
	role="presentation"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
>
	<img
		src={props.url}
		alt=""
		draggable="false"
		class="rounded-base block max-h-[45vh] max-w-full"
		bind:clientWidth={shownWidth}
		bind:clientHeight={shownHeight}
	/>
	{#if shownRegion}
		<div
			class="border-primary-ink bg-primary-tint pointer-events-none absolute border"
			style:left="{shownRegion.x * k}px"
			style:top="{shownRegion.y * k}px"
			style:width="{shownRegion.w * k}px"
			style:height="{shownRegion.h * k}px"
		></div>
	{/if}
</div>
