<script lang="ts">
	type ColumnResizeHandleProps = { onpress: (event: MouseEvent) => void };
	const props: ColumnResizeHandleProps = $props();

	function press(event: MouseEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		props.onpress(event);
	}
</script>

<!-- invisible as P0's was (it never loaded the tables stylesheet); the cursor is the one addition -->
<div class="column-resize-handle" role="presentation" onmousedown={press}></div>

<style>
	.column-resize-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		right: -2px;
		width: 4px;
		cursor: col-resize;
		pointer-events: all;
	}
</style>
