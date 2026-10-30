<script lang="ts">
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const k = $derived(1 / props.editor.viewport.scale);
	const half = $derived(Math.min(props.editor.diagram.step * 0.3, 14 * k));
	const carried = $derived(props.gesture.carried);
	const shown = $derived(
		carried ? props.editor.diagram.places.filter((p) => p.cell === null) : props.gesture.hoverPlace ? [props.gesture.hoverPlace] : []
	);
</script>

<!-- a free place on the grid, shown under the pointer: a click puts a cell there; all of them while a cell is carried -->
{#each shown as p (`${p.r},${p.c}`)}
	{@const target = carried?.to === p}
	<g data-handle="place" data-place="{p.r},{p.c}" class="cursor-pointer">
		<rect
			x={p.at[0] - half}
			y={p.at[1] - half}
			width={half * 2}
			height={half * 2}
			rx={3 * k}
			fill={target ? 'var(--primary-tint)' : 'var(--color-surface-50-950)'}
			fill-opacity={target ? undefined : 0.9}
			stroke={target || !carried ? 'var(--primary-ink)' : 'var(--primary-wash)'}
			stroke-dasharray="{3 * k} {2 * k}"
			stroke-width="1"
			vector-effect="non-scaling-stroke"
		/>
		{#if !carried}
			<path
				d="M{p.at[0] - half / 2} {p.at[1]}h{half}M{p.at[0]} {p.at[1] - half / 2}v{half}"
				stroke="var(--primary-ink)"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
	</g>
{/each}
