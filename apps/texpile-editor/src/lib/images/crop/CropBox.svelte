<script lang="ts">
	// a crop box over an image drawn at `rect`: the image dimmed outside it, eight handles, and the box dragged inside
	import { dragCrop, type Crop, type CropHandle } from './cropGeometry';

	type Props = { rect: { x: number; y: number; w: number; h: number }; crop: Crop; onchange: (crop: Crop) => void };
	const props: Props = $props();

	// the smallest box, in pixels on screen
	const MIN_PX = 16;
	const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

	const box = $derived({
		x: props.rect.x + props.crop.l * props.rect.w,
		y: props.rect.y + props.crop.t * props.rect.h,
		w: props.rect.w * (1 - props.crop.l - props.crop.r),
		h: props.rect.h * (1 - props.crop.t - props.crop.b)
	});

	function start(handle: CropHandle, e: PointerEvent): void {
		e.preventDefault();
		e.stopPropagation();
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		const from = { x: e.clientX, y: e.clientY, crop: props.crop };
		const min = { x: MIN_PX / props.rect.w, y: MIN_PX / props.rect.h };
		function move(m: PointerEvent): void {
			props.onchange(dragCrop(from.crop, handle, (m.clientX - from.x) / props.rect.w, (m.clientY - from.y) / props.rect.h, min));
		}
		function end(): void {
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', end);
			target.removeEventListener('pointercancel', end);
		}
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', end);
		target.addEventListener('pointercancel', end);
	}
</script>

<div class="pointer-events-none absolute inset-0">
	<div class="crop-shade" style="left:{props.rect.x}px;top:{props.rect.y}px;width:{props.rect.w}px;height:{box.y - props.rect.y}px"></div>
	<div
		class="crop-shade"
		style="left:{props.rect.x}px;top:{box.y + box.h}px;width:{props.rect.w}px;height:{props.rect.y + props.rect.h - box.y - box.h}px"
	></div>
	<div class="crop-shade" style="left:{props.rect.x}px;top:{box.y}px;width:{box.x - props.rect.x}px;height:{box.h}px"></div>
	<div
		class="crop-shade"
		style="left:{box.x + box.w}px;top:{box.y}px;width:{props.rect.x + props.rect.w - box.x - box.w}px;height:{box.h}px"
	></div>
	<div
		class="crop-box pointer-events-auto"
		style="left:{box.x}px;top:{box.y}px;width:{box.w}px;height:{box.h}px"
		role="presentation"
		onpointerdown={(e) => start('move', e)}
	>
		{#each HANDLES as handle (handle)}
			<span class="crop-handle crop-handle-{handle}" role="presentation" onpointerdown={(e) => start(handle, e)}></span>
		{/each}
	</div>
</div>

<style>
	.crop-shade {
		position: absolute;
		background: rgb(0 0 0 / 0.5);
	}

	.crop-box {
		position: absolute;
		cursor: move;
		border: 1.5px solid #fff;
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
		touch-action: none;
	}

	.crop-handle {
		position: absolute;
		width: 12px;
		height: 12px;
		margin: -6px 0 0 -6px;
		border: 1px solid rgb(0 0 0 / 0.45);
		border-radius: 2px;
		background: #fff;
		touch-action: none;
	}

	.crop-handle-nw {
		left: 0;
		top: 0;
		cursor: nwse-resize;
	}
	.crop-handle-n {
		left: 50%;
		top: 0;
		cursor: ns-resize;
	}
	.crop-handle-ne {
		left: 100%;
		top: 0;
		cursor: nesw-resize;
	}
	.crop-handle-e {
		left: 100%;
		top: 50%;
		cursor: ew-resize;
	}
	.crop-handle-se {
		left: 100%;
		top: 100%;
		cursor: nwse-resize;
	}
	.crop-handle-s {
		left: 50%;
		top: 100%;
		cursor: ns-resize;
	}
	.crop-handle-sw {
		left: 0;
		top: 100%;
		cursor: nesw-resize;
	}
	.crop-handle-w {
		left: 0;
		top: 50%;
		cursor: ew-resize;
	}
</style>
