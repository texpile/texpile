<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	const CORNER_PX = 8;
	const EDGE_HIT_PX = 8;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	type Axes = 'x' | 'y' | 'xy';

	const s = $derived(props.editor.sheetHandles.length ? props.editor.sheet : null);
	let hover = $state<Axes | null>(null);
	// an edge lights up under the pointer and while it is dragged; the corner lights both
	const lit = $derived(props.gesture.sizing ?? hover);
	const k = $derived(1 / props.editor.viewport.scale);
	const edges = $derived(
		s
			? [
					{ key: 'fx', axes: 'x' as const, x1: s.x + s.w, y1: s.y, x2: s.x + s.w, y2: s.y + s.h, cursor: 'ew-resize' },
					{ key: 'fy', axes: 'y' as const, x1: s.x, y1: s.y + s.h, x2: s.x + s.w, y2: s.y + s.h, cursor: 'ns-resize' }
				]
			: []
	);
</script>

{#if s}
	{#each edges as e (e.key)}
		{#if lit?.includes(e.axes)}
			<line
				x1={e.x1}
				y1={e.y1}
				x2={e.x2}
				y2={e.y2}
				stroke="var(--primary-ink)"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
				pointer-events="none"
			/>
		{/if}
		<line
			data-handle={e.key}
			x1={e.x1}
			y1={e.y1}
			x2={e.x2}
			y2={e.y2}
			stroke="transparent"
			stroke-width={EDGE_HIT_PX}
			vector-effect="non-scaling-stroke"
			pointer-events="stroke"
			style:cursor={e.cursor}
			role="presentation"
			onpointerenter={() => (hover = e.axes)}
			onpointerleave={() => (hover = null)}
		/>
	{/each}
	<rect
		x={s.x + s.w - (CORNER_PX / 2) * k}
		y={s.y + s.h - (CORNER_PX / 2) * k}
		width={CORNER_PX * k}
		height={CORNER_PX * k}
		rx={1.5 * k}
		fill="var(--color-surface-50-950)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
	<!-- twice the square, so the corner is easy to catch -->
	<rect
		data-handle="fxy"
		x={s.x + s.w - CORNER_PX * k}
		y={s.y + s.h - CORNER_PX * k}
		width={2 * CORNER_PX * k}
		height={2 * CORNER_PX * k}
		fill="transparent"
		style:cursor="nesw-resize"
		role="presentation"
		onpointerenter={() => (hover = 'xy')}
		onpointerleave={() => (hover = null)}
	/>
{/if}
