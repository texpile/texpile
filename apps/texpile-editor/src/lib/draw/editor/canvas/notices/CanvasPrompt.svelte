<script lang="ts">
	type Props = { text: string };
	const props: Props = $props();
</script>

<!-- CAD's prompt line: what the next click does; clear of the zoom and undo buttons on the left -->
<div class="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center pr-4 pl-64">
	<p class="card preset-filled-surface-100-900 border-surface-200-800 rounded-base border px-3 py-1.5 text-xs shadow-sm">{props.text}</p>
</div>
