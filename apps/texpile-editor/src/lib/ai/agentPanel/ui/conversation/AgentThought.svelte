<script lang="ts">
	// What the agent thought on the way, folded to one line
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { text: string };
	const props: Props = $props();
	let open = $state(false);
</script>

<div class="text-muted -mx-1 text-xs">
	<button class="hover:preset-tonal rounded-base flex items-center gap-1 px-1 py-0.5" aria-expanded={open} onclick={() => (open = !open)}>
		{#if open}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}
		<span class="cap-center">{m.agent_panel_thinking()}</span>
	</button>
	{#if open}<p class="mt-1 pl-5 break-words whitespace-pre-wrap italic">{props.text}</p>{/if}
</div>
