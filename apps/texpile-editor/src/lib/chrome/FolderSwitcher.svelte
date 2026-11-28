<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { tip } from '$lib/components/tooltip.svelte';
	const name = $derived((workspaceRoot.current ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '');
</script>

{#if name}
	<div class="app-no-drag ml-1 flex items-center self-center">
		<button class="title-bar-button text-surface-950-50 gap-1 font-semibold" use:tip={'Recent folders'}>
			<span class="cap-center">{name}</span>
			<ChevronDown class="size-3 opacity-60" />
		</button>
	</div>
{/if}
