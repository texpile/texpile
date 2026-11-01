<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';

	type Props = { gesture: CanvasGesture };
	const props: Props = $props();
	const box = $derived(props.gesture.marquee);
</script>

{#each props.gesture.snap.guides as g, n (n)}
	<line
		x1={g.axis === 'x' ? g.at : g.from}
		y1={g.axis === 'x' ? g.from : g.at}
		x2={g.axis === 'x' ? g.at : g.to}
		y2={g.axis === 'x' ? g.to : g.at}
		stroke={g.tracking ? 'var(--primary-ink)' : 'var(--error-ink)'}
		stroke-width="1"
		stroke-dasharray={g.tracking ? '3 3' : undefined}
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
{/each}
{#if box}
	<rect
		x={box.x1}
		y={box.y1}
		width={box.x2 - box.x1}
		height={box.y2 - box.y1}
		fill="var(--primary-tint)"
		stroke="var(--primary-ink)"
		stroke-width="1"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
{/if}
