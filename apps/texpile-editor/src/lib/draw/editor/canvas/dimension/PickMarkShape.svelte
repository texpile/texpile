<script lang="ts">
	import type { PickMark } from './pickMarks';

	type Props = { mark: PickMark; scale: number };
	const props: Props = $props();
	const mark = $derived(props.mark);
</script>

{#if 'line' in mark}
	<line
		x1={mark.line[0][0]}
		y1={mark.line[0][1]}
		x2={mark.line[1][0]}
		y2={mark.line[1][1]}
		stroke="currentColor"
		stroke-width="3"
		stroke-opacity="0.6"
		vector-effect="non-scaling-stroke"
	/>
{:else if 'ring' in mark}
	<circle
		cx={mark.ring[0]}
		cy={mark.ring[1]}
		r={4 / props.scale}
		fill="var(--color-surface-50-950)"
		stroke="currentColor"
		stroke-width="2"
		vector-effect="non-scaling-stroke"
	/>
{:else if 'circle' in mark}
	<circle
		cx={mark.circle[0]}
		cy={mark.circle[1]}
		r={mark.r}
		fill="none"
		stroke="currentColor"
		stroke-width="3"
		stroke-opacity="0.6"
		vector-effect="non-scaling-stroke"
	/>
{:else}
	<rect
		x={Math.min(mark.box[0][0], mark.box[1][0])}
		y={Math.min(mark.box[0][1], mark.box[1][1])}
		width={Math.abs(mark.box[1][0] - mark.box[0][0])}
		height={Math.abs(mark.box[1][1] - mark.box[0][1])}
		fill="none"
		stroke="currentColor"
		stroke-width="3"
		stroke-opacity="0.6"
		vector-effect="non-scaling-stroke"
	/>
{/if}
