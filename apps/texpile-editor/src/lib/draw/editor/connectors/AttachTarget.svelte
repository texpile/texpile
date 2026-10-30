<script lang="ts">
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { anchorPoint, CORNERS, SIDES } from './connectorGeometry';

	const PAD_PX = 3;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const t = $derived(props.gesture.attach);
	const k = $derived(1 / props.editor.viewport.scale);
</script>

<!-- the node an end is about to meet: its sides and corners, the one it will meet at filled; none filled meets the
     border -->
{#if t}
	<g pointer-events="none">
		<rect
			x={t.box.x1 - PAD_PX * k}
			y={t.box.y1 - PAD_PX * k}
			width={t.box.x2 - t.box.x1 + 2 * PAD_PX * k}
			height={t.box.y2 - t.box.y1 + 2 * PAD_PX * k}
			rx={3 * k}
			fill={t.anchor ? 'none' : 'var(--primary-tint)'}
			stroke="var(--primary-ink)"
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>
		{#each t.pins as pin (pin.anchor)}
			<circle
				cx={pin.at[0]}
				cy={pin.at[1]}
				r={(t.anchor === pin.anchor ? 4.5 : 3) * k}
				fill={t.anchor === pin.anchor ? 'var(--primary-ink)' : 'var(--color-surface-50-950)'}
				stroke="var(--primary-ink)"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
			/>
		{/each}
		{#each t.pins.length ? [] : [...SIDES, ...(t.round ? [] : CORNERS)] as side (side)}
			{@const [x, y] = anchorPoint(t.box, side)}
			<circle
				cx={x}
				cy={y}
				r={(t.anchor === side ? 4.5 : 3) * k}
				fill={t.anchor === side ? 'var(--primary-ink)' : 'var(--color-surface-50-950)'}
				stroke="var(--primary-ink)"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
			/>
		{/each}
	</g>
{/if}
