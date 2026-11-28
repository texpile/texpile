<script lang="ts">
	import { CircleAlert, TriangleAlert } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { problemsView } from '../problemsStore.svelte';

	type Props = { class: string; onclick: () => void };
	const props: Props = $props();
	const { class: look, onclick } = $derived(props);

	const errors = $derived(problemsView.counts.error);
	// spelling, grammar and style show only in the tab
	const warnings = $derived(problemsView.counts.warning + problemsView.counts.reference);
</script>

{#if errors > 0 || warnings > 0}
	<button class="{look} gap-1 {errors > 0 ? 'text-error-ink' : 'text-warning-ink'}" {onclick} use:tip={m.wsview_show_problems_title()}>
		{#if errors > 0}
			<CircleAlert class="size-3.5" /> {errors}
		{/if}
		{#if warnings > 0}
			<TriangleAlert class="size-3.5" /> {warnings}
		{/if}
	</button>
{/if}
