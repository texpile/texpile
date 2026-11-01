<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ArrangeAction } from './arrangeActions';

	type Props = { actions: ArrangeAction[] };
	const props: Props = $props();
</script>

<div class="flex shrink-0 items-center gap-1">
	{#each props.actions as action (action.key)}
		<button
			class="btn-icon btn-icon-xs hover:preset-tonal disabled:opacity-40"
			disabled={action.disabled}
			aria-label={action.label}
			use:tip={action.hint}
			onclick={action.run}
		>
			<action.icon class="size-4 shrink-0" />
		</button>
	{/each}
</div>
