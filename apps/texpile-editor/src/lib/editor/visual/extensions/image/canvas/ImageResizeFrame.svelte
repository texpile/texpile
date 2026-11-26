<script lang="ts">
	import { ResizeDirection } from '../types';

	type ImageResizeFrameProps = { onpress: (direction: ResizeDirection, event: MouseEvent) => void };
	const props: ImageResizeFrameProps = $props();

	function press(direction: ResizeDirection, event: MouseEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		props.onpress(direction, event);
	}
</script>

<div class="image-resize-frame">
	{#each Object.values(ResizeDirection) as direction (direction)}
		<span class="image-resize-handle {direction}" role="presentation" onmousedown={(event) => press(direction, event)}></span>
	{/each}
</div>

<style>
	.image-resize-frame {
		position: absolute;
		inset: 0;
		outline: 1px solid var(--color-primary-500);
		pointer-events: none;
	}
	.image-resize-handle {
		position: absolute;
		width: 8px;
		height: 8px;
		background-color: var(--color-primary-500);
		border: solid 1px var(--color-surface-50);
		box-sizing: border-box;
		pointer-events: all;
	}
	.image-resize-handle::before {
		content: '';
		position: absolute;
		inset: -10px;
	}
	/* the grab area reaches over the picture only: below it the caption takes clicks, above it the text before */
	.top::before,
	.topLeft::before,
	.topRight::before {
		top: 0;
	}
	.bottom::before,
	.bottomLeft::before,
	.bottomRight::before {
		bottom: 0;
	}
	.topLeft {
		cursor: nw-resize;
		left: -4px;
		top: -4px;
	}
	.top {
		cursor: n-resize;
		left: 50%;
		margin-left: -4px;
		top: -4px;
	}
	.topRight {
		cursor: ne-resize;
		right: -4px;
		top: -4px;
	}
	.right {
		cursor: e-resize;
		right: -4px;
		top: 50%;
		margin-top: -4px;
	}
	.bottomRight {
		cursor: se-resize;
		right: -4px;
		bottom: -4px;
	}
	.bottom {
		cursor: s-resize;
		left: 50%;
		margin-left: -4px;
		bottom: -4px;
	}
	.bottomLeft {
		cursor: sw-resize;
		left: -4px;
		bottom: -4px;
	}
	.left {
		cursor: w-resize;
		left: -4px;
		top: 50%;
		margin-top: -4px;
	}
</style>
