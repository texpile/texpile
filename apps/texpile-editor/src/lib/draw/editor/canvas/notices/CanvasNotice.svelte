<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { error?: boolean; class?: string; children: Snippet };
	const props: Props = $props();
</script>

<div
	class="bg-surface-50-950 border-surface-200-800 rounded-container absolute bottom-14 left-1/2 flex min-h-9 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 border py-1 pr-1 pl-2.5 text-xs whitespace-nowrap shadow-lg {props.error
		? 'text-error-ink'
		: ''} {props.class ?? ''}"
>
	{@render props.children()}
</div>
