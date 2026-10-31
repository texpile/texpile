<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Progress } from '@skeletonlabs/skeleton-svelte';

	type Props = { engineName: string };
	const props: Props = $props();

	// the first start after installing an engine builds its font database or fetches packages; say so once the wait is long
	let slow = $state(false);
	$effect(() => {
		const timer = setTimeout(() => (slow = true), 5000);
		return () => clearTimeout(timer);
	});
</script>

<!-- the engine reports no share of its start, so the bar runs until the first drawing -->
<Progress value={null} class="w-56 items-center gap-2">
	<Progress.Label class="text-xs">{m.figure_notice_loading({ engine: props.engineName })}</Progress.Label>
	<!-- in the primary color Texpile's own progress bars wear -->
	<Progress.Track><Progress.Range class="bg-primary-500" /></Progress.Track>
</Progress>
{#if slow}<span class="text-xs">{m.figure_notice_first_start({ engine: props.engineName })}</span>{/if}
