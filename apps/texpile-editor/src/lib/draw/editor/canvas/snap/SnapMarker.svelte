<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Snap, SnapKind } from '../../state/snap/snapScene.types';

	type Props = { snap: Snap; scale: number };
	const props: Props = $props();

	const LABELS: Record<SnapKind, () => string> = {
		endpoint: () => m.figure_snap_endpoint(),
		midpoint: () => m.figure_snap_midpoint(),
		center: () => m.figure_snap_center(),
		quadrant: () => m.figure_snap_quadrant(),
		intersection: () => m.figure_snap_intersection(),
		perpendicular: () => m.figure_snap_perpendicular()
	};
	// half the marker's size, 6 px at any zoom
	const r = $derived(6 / props.scale);
	const [x, y] = $derived(props.snap.at);
</script>

<!-- AutoCAD's markers, which FreeCAD and QCAD follow: a square for an end, a triangle for a middle, a circle for a
     center, a diamond for a quadrant, a cross for an intersection, a right angle for a perpendicular -->
<g
	fill="none"
	stroke="var(--primary-ink)"
	stroke-width="1.75"
	vector-effect="non-scaling-stroke"
	pointer-events="none"
	data-snap={props.snap.kind}
>
	{#if props.snap.kind === 'endpoint'}
		<rect x={x - r} y={y - r} width={2 * r} height={2 * r} vector-effect="non-scaling-stroke" />
	{:else if props.snap.kind === 'midpoint'}
		<path d="M{x} {y + r}L{x + r} {y - r * 0.8}L{x - r} {y - r * 0.8}Z" vector-effect="non-scaling-stroke" />
	{:else if props.snap.kind === 'center'}
		<circle cx={x} cy={y} {r} vector-effect="non-scaling-stroke" />
		<path d="M{x - r * 0.4} {y}H{x + r * 0.4}M{x} {y - r * 0.4}V{y + r * 0.4}" vector-effect="non-scaling-stroke" />
	{:else if props.snap.kind === 'quadrant'}
		<path d="M{x} {y - r}L{x + r} {y}L{x} {y + r}L{x - r} {y}Z" vector-effect="non-scaling-stroke" />
	{:else if props.snap.kind === 'intersection'}
		<path d="M{x - r} {y - r}L{x + r} {y + r}M{x + r} {y - r}L{x - r} {y + r}" vector-effect="non-scaling-stroke" />
	{:else}
		<path d="M{x - r} {y + r}V{y - r}H{x + r}M{x - r} {y}H{x}V{y - r}" vector-effect="non-scaling-stroke" />
	{/if}
	<!-- the canvas is y up, so the label is turned back upright -->
	<text
		x={x + r * 1.6}
		y={-(y + r * 1.6)}
		transform="scale(1,-1)"
		font-size={11 / props.scale}
		fill="var(--primary-ink)"
		stroke="var(--color-surface-50)"
		stroke-width={3 / props.scale}
		paint-order="stroke">{LABELS[props.snap.kind]()}</text
	>
</g>
