<script lang="ts">
	import { Shapes } from '@lucide/svelte';

	type Props = {
		title: string;
		summary: string;
	};
	const props: Props = $props();
</script>

<div
	class="border-surface-300-700 text-muted rounded-base flex h-36 w-full flex-col items-center justify-center gap-1 border border-dashed"
>
	<Shapes class="size-6" />
	<span class="text-surface-950-50 text-sm font-semibold">{props.title}</span>
	{#if props.summary}<span class="text-xs">{props.summary}</span>{/if}
</div>
