<script lang="ts">
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { anchorPoint, SIDES } from './connectorGeometry';

	const GAP_PX = 7;
	const R_PX = 4;
	// just outside each side, so a press there is not on the node
	const OUT: Record<string, [number, number]> = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const box = $derived(props.gesture.hoverNode);
	const k = $derived(1 / props.editor.viewport.scale);
	const pins = $derived(box ? props.editor.render.pins.filter((p) => p.i === box.stmt) : []);
	const dots = $derived(
		box && !pins.length
			? SIDES.map((side) => {
					const [x, y] = anchorPoint(box, side);
					return { side, x: x + OUT[side][0] * GAP_PX * k, y: y + OUT[side][1] * GAP_PX * k };
				})
			: []
	);
</script>

<!-- a drag from a side draws an arrow out of the node, as design tools connect shapes; from a pin, a wire -->
{#each pins as pin (pin.anchor)}
	<circle
		data-handle="connect"
		data-connect-from={box?.stmt}
		data-connect-pin={pin.anchor}
		class="cursor-crosshair"
		cx={pin.at[0]}
		cy={pin.at[1]}
		r={R_PX * k}
		fill="var(--color-surface-50-950)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
{/each}
{#each dots as d (d.side)}
	<circle
		data-handle="connect"
		data-connect-from={box?.stmt}
		data-connect-side={d.side}
		class="cursor-crosshair"
		cx={d.x}
		cy={d.y}
		r={R_PX * k}
		fill="var(--color-surface-50-950)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
{/each}
