<script lang="ts">
	type Props = { text: string };
	const props: Props = $props();
</script>

<div class="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center pr-4 pl-64">
	<p class="bg-surface-50-950 border-surface-200-800 rounded-container border px-3 py-1.5 text-xs shadow-lg">{props.text}</p>
</div>
