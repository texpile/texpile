<script lang="ts">
	import type { DimensionDrawing } from './dimensionDrawing';

	type Props = { drawing: DimensionDrawing };
	const props: Props = $props();
</script>

{#each props.drawing.lines as [a, b], n (n)}
	<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />
{/each}
{#each props.drawing.arrows as arrow, n (n)}
	<polygon points={arrow.map((p) => p.join(',')).join(' ')} fill="currentColor" />
{/each}
