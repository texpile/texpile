<script lang="ts">
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { shapePreviewPath } from './shapePreviewPath';
	import SnapMarker from './snap/SnapMarker.svelte';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();
	const uid = $props.id();

	const d = $derived(
		props.gesture.shownPreview ? shapePreviewPath(props.gesture.shownPreview, (u, v) => props.editor.toCanvas(u, v)) : null
	);
</script>

{#if props.gesture.snap.mark}
	<SnapMarker snap={props.gesture.snap.mark} scale={props.editor.viewport.scale} />
{/if}
{#if props.gesture.shownPreview?.byClicks}
	<!-- the points clicked so far -->
	{#each props.gesture.shownPreview.points.slice(0, -1) as [u, v], k (k)}
		{@const [x, y] = props.editor.toCanvas(u, v)}
		<circle cx={x} cy={y} r={3 / props.editor.viewport.scale} fill="var(--primary-ink)" pointer-events="none" />
	{/each}
{/if}
{#if d}
	<!-- a tip 12 px long at any zoom -->
	<marker
		id="{uid}-tip"
		viewBox="0 0 10 10"
		refX="9"
		refY="5"
		markerUnits="userSpaceOnUse"
		markerWidth={12 / props.editor.viewport.scale}
		markerHeight={12 / props.editor.viewport.scale}
		orient="auto"
	>
		<path d="M1 1L9 5L1 9" fill="none" stroke="var(--primary-ink)" stroke-width="1.25" stroke-linejoin="round" />
	</marker>
	<path
		{d}
		fill="none"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
		marker-end={props.gesture.shownPreview?.tool === 'arrow' ? `url(#${uid}-tip)` : undefined}
		pointer-events="none"
	/>
{/if}
