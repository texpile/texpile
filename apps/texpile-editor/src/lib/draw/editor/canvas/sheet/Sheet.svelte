<script lang="ts">
	import { sourcePoint } from '../../figure/geometry';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const sheet = $derived(props.editor.sheet);
	const lines = $derived.by(() => {
		if (!sheet || !props.editor.gridShown) return [];
		const m = props.editor.placement;
		const [u1, v1] = sourcePoint(sheet.x, sheet.y, m);
		const [u2, v2] = sourcePoint(sheet.x + sheet.w, sheet.y + sheet.h, m);
		const [ua, ub, va, vb] = [Math.min(u1, u2), Math.max(u1, u2), Math.min(v1, v2), Math.max(v1, v2)];
		const out: { a: [number, number]; b: [number, number]; major: boolean }[] = [];
		for (let u = Math.ceil(ua * 2) / 2; u <= ub + 1e-9; u += 0.5)
			out.push({ a: props.editor.toCanvas(u, va), b: props.editor.toCanvas(u, vb), major: Number.isInteger(u) });
		for (let v = Math.ceil(va * 2) / 2; v <= vb + 1e-9; v += 0.5)
			out.push({ a: props.editor.toCanvas(ua, v), b: props.editor.toCanvas(ub, v), major: Number.isInteger(v) });
		return out.length > 4000 ? [] : out;
	});
	const origin = $derived(props.editor.toCanvas(0, 0));
</script>

{#if sheet}
	<!-- the sheet is paper in either theme: the drawing's colors are the PDF's -->
	<rect x={sheet.x} y={sheet.y} width={sheet.w} height={sheet.h} style:fill="var(--page-sheet)" />
	<g data-grid>
		{#each lines as l, n (n)}
			<line
				x1={l.a[0]}
				y1={l.a[1]}
				x2={l.b[0]}
				y2={l.b[1]}
				style:stroke={l.major ? 'var(--color-surface-200)' : 'var(--color-surface-100)'}
				stroke-width="1"
				vector-effect="non-scaling-stroke"
			/>
		{/each}
	</g>
	{#if sheet.framed}
		<rect
			x={sheet.x}
			y={sheet.y}
			width={sheet.w}
			height={sheet.h}
			fill="none"
			style:stroke="var(--color-surface-300)"
			stroke-width="1"
			vector-effect="non-scaling-stroke"
		/>
		<circle
			cx={origin[0]}
			cy={origin[1]}
			r={3 / props.editor.viewport.scale}
			fill="none"
			style:stroke="var(--color-surface-400)"
			stroke-width="1"
			vector-effect="non-scaling-stroke"
		/>
	{:else}
		<rect
			x={sheet.x}
			y={sheet.y}
			width={sheet.w}
			height={sheet.h}
			class="scheme-light"
			fill="none"
			stroke="var(--primary-ink)"
			stroke-dasharray="6 4"
			stroke-width="1.2"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
{/if}
