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
		box-shadow: 0 0 1px 1px var(--image-frame);
		pointer-events: none;
	}
	.image-resize-handle {
		position: absolute;
		width: calc(var(--spacing) * 2.5);
		height: calc(var(--spacing) * 2.5);
		background-color: darkgreen;
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
		left: -5px;
		top: -5px;
	}
	.top {
		cursor: n-resize;
		left: 50%;
		margin-left: -5px;
		top: -5px;
	}
	.topRight {
		cursor: ne-resize;
		right: -5px;
		top: -5px;
	}
	.right {
		cursor: e-resize;
		right: -5px;
		top: 50%;
		margin-top: -5px;
	}
	.bottomRight {
		cursor: se-resize;
		right: -5px;
		bottom: -5px;
	}
	.bottom {
		cursor: s-resize;
		left: 50%;
		margin-left: -5px;
		bottom: -5px;
	}
	.bottomLeft {
		cursor: sw-resize;
		left: -5px;
		bottom: -5px;
	}
	.left {
		cursor: w-resize;
		left: -5px;
		top: 50%;
		margin-top: -5px;
	}
</style>
